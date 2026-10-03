from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_provider import TimeProvider, get_time_provider
from app.domain.enums import ActionType, Role
from app.main import app
from tests.factories import make_event, make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def fixed_clock() -> Iterator[None]:
    app.dependency_overrides[get_time_provider] = lambda: TimeProvider(base_time_source=lambda: NOW)
    yield


async def onboarding_world(session: AsyncSession) -> None:
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    devs = [await make_user(session, f"dev{index}") for index in range(3)]
    await make_user(session, "nowy-dev")
    for name in ("core-api", "frontend-app"):
        repo = await make_repo(session, name)
        await make_lease(session, admin, repo, Role.ADMIN, granted_at=NOW, expires_at=None)
        for dev in devs[:2]:
            await make_lease(session, dev, repo, Role.WRITE, granted_at=NOW, expires_at=NOW + timedelta(days=29))
            await make_event(session, dev, repo, ActionType.PUSH, NOW - timedelta(days=1))
    await session.commit()


def names(entries: list[dict]) -> list[str]:
    return [entry["repository"]["name"] for entry in entries]


async def test_proposal_for_new_developer(client: AsyncClient, session: AsyncSession) -> None:
    await onboarding_world(session)

    body = (await client.get("/api/v1/onboarding/nowy-dev")).json()

    assert (body["user"]["login"], body["team"]["slug"]) == ("nowy-dev", "dev")
    assert names(body["to_grant"]) == ["core-api", "frontend-app"]
    assert {entry["proposed_role"] for entry in body["to_grant"]} == {"write"}
    assert body["already_granted"] == []


async def test_apply_is_idempotent_and_audited_once(client: AsyncClient, session: AsyncSession) -> None:
    await onboarding_world(session)

    first = await client.post("/api/v1/onboarding/nowy-dev/apply")
    second = await client.post("/api/v1/onboarding/nowy-dev/apply")
    audit = (await client.get("/api/v1/audit", params={"action": "BASELINE_APPLIED"})).json()

    assert first.status_code == 200
    assert (first.json()["to_grant"], names(first.json()["already_granted"])) == ([], ["core-api", "frontend-app"])
    assert second.json() == first.json()
    assert [(entry["actor_login"], entry["target"]) for entry in audit] == [("tomasz-admin", "dev:nowy-dev")]


async def test_unknown_and_admin_logins(client: AsyncClient, session: AsyncSession) -> None:
    await onboarding_world(session)

    ghost = await client.get("/api/v1/onboarding/ghost")
    admin = await client.post("/api/v1/onboarding/tomasz-admin/apply")

    assert (ghost.status_code, ghost.json()) == (404, {"detail": "User ghost not found"})
    assert (admin.status_code, admin.json()) == (422, {"detail": "User tomasz-admin does not belong to a team"})


async def test_apply_without_admin_account_returns_503(client: AsyncClient, session: AsyncSession) -> None:
    await make_user(session, "nowy-dev")
    await session.commit()

    response = await client.post("/api/v1/onboarding/nowy-dev/apply")

    assert response.status_code == 503
