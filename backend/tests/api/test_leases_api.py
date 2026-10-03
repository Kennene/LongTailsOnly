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
DAY = timedelta(days=1)


@pytest.fixture(autouse=True)
def clock() -> Iterator[TimeProvider]:
    fixed = TimeProvider(base_time_source=lambda: NOW)
    app.dependency_overrides[get_time_provider] = lambda: fixed
    yield fixed
    app.dependency_overrides.pop(get_time_provider, None)


async def world(session: AsyncSession) -> dict[str, int]:
    owner = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    kamil = await make_user(session, "kamil")
    core = await make_repo(session, "core-api")
    write = await make_lease(session, kamil, core, Role.WRITE, granted_at=NOW - 90 * DAY, expires_at=NOW + 4 * DAY)
    admin = await make_lease(session, owner, core, Role.ADMIN, granted_at=NOW - 365 * DAY, expires_at=None)
    for action, days in [(ActionType.PUSH, 26), (ActionType.PR_REVIEW, 2), (ActionType.PR_REVIEW, 5),
                         (ActionType.ISSUE_COMMENT, 40), (ActionType.PR_MERGE, 1)]:
        await make_event(session, kamil, core, action, NOW - days * DAY)
    await session.commit()
    return {"write": write.id, "admin": admin.id}


async def test_list_returns_every_lease_with_engine_values(client: AsyncClient, session: AsyncSession) -> None:
    ids = await world(session)

    body = (await client.get("/api/v1/leases")).json()

    assert [row["id"] for row in body] == [ids["write"], ids["admin"]]
    write, admin = body
    assert (write["status"], write["days_remaining"], write["recommendation"]) == ("WARNING", 4, "DOWNSCOPE")
    assert write["last_activity_at"] == "2026-10-01T12:00:00Z"
    assert (admin["status"], admin["days_remaining"], admin["recommendation"]) == ("PERMANENT", None, "KEEP")


async def test_single_lease_and_404(client: AsyncClient, session: AsyncSession) -> None:
    ids = await world(session)
    assert (await client.get(f"/api/v1/leases/{ids['write']}")).json()["user"]["login"] == "kamil"
    assert (await client.get("/api/v1/leases/999")).status_code == 404


async def test_extend_decision_returns_the_updated_overview(client: AsyncClient, session: AsyncSession) -> None:
    ids = await world(session)

    r = await client.post(f"/api/v1/leases/{ids['write']}/decision",
                          json={"action": "EXTEND", "extension": {"multiplier": 2.0}})

    assert r.status_code == 200
    assert (r.json()["status"], r.json()["days_remaining"]) == ("ACTIVE", 64)


async def test_downscope_without_justification_is_422(client: AsyncClient, session: AsyncSession) -> None:
    ids = await world(session)
    r = await client.post(f"/api/v1/leases/{ids['write']}/decision", json={"action": "DOWNSCOPE"})
    assert r.status_code == 422


async def test_revoking_the_last_admin_is_403_and_stays_in_the_audit(client: AsyncClient,
                                                                     session: AsyncSession) -> None:
    ids = await world(session)

    r = await client.post(f"/api/v1/leases/{ids['admin']}/decision",
                          json={"action": "REVOKE", "justification": "Porządki"})

    assert (r.status_code, r.json()) == (403, {"detail": "Cannot remove the last administrator of the organization"})
    audit = (await client.get("/api/v1/audit", params={"action": "LAST_ADMIN_BLOCKED"})).json()
    assert [entry["target"] for entry in audit] == ["longtails/core-api:tomasz-admin"]
    assert (await client.get(f"/api/v1/leases/{ids['admin']}")).json()["status"] == "PERMANENT"


async def test_activity_stats_count_renewing_actions_in_the_lease_window(client: AsyncClient,
                                                                         session: AsyncSession) -> None:
    ids = await world(session)

    body = (await client.get(f"/api/v1/leases/{ids['write']}/activity-stats")).json()

    assert body == {
        "lease_id": ids["write"], "window_days": 30, "window_start": "2026-09-03T12:00:00Z",
        "window_end": "2026-10-03T12:00:00Z", "push_count": 1, "review_count": 2, "comment_count": 0,
        "last_activity_at": "2026-10-01T12:00:00Z",
    }
    assert (await client.get("/api/v1/leases/999/activity-stats")).status_code == 404
