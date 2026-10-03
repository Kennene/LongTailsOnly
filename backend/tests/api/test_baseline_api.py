from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_provider import TimeProvider, get_time_provider
from app.domain.enums import ActionType, Role
from app.main import app
from tests.factories import make_event, make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def test_team_baseline_endpoint(client: AsyncClient, session: AsyncSession) -> None:
    app.dependency_overrides[get_time_provider] = lambda: TimeProvider(base_time_source=lambda: NOW)
    dev = await make_user(session, "dev0")
    await make_user(session, "dev1")
    repo = await make_repo(session, "core-api")
    await make_event(session, dev, repo, ActionType.PUSH, NOW - timedelta(days=1))
    await session.commit()

    response = await client.get("/api/v1/teams/dev/baseline")

    assert response.status_code == 200
    assert response.json() == [{
        "team_id": dev.team_id,
        "repository": {"id": repo.id, "name": "core-api", "owner": "longtails", "default_branch": "main",
                       "default_lease_duration_days": 30},
        "proposed_role": "write",
        "active_members": 1,
        "team_size": 2,
    }]


async def test_unknown_team_returns_404(client: AsyncClient) -> None:
    response = await client.get("/api/v1/teams/ops/baseline")

    assert (response.status_code, response.json()) == (404, {"detail": "Team ops not found"})


async def test_onboarding_candidates_are_team_members_without_live_access(
    client: AsyncClient, session: AsyncSession
) -> None:
    repo = await make_repo(session, "core-api")
    leased = await make_user(session, "dev-leased")
    revoked = await make_user(session, "dev-revoked")
    await make_user(session, "nowy-dev")
    await make_user(session, "dev-admin", is_admin=True)
    await make_user(session, "qa-new", team="qa")
    await make_lease(session, leased, repo, Role.WRITE, granted_at=NOW, expires_at=NOW + timedelta(days=30))
    await make_lease(session, revoked, repo, Role.WRITE, granted_at=NOW, expires_at=None, is_active=False)
    await session.commit()

    response = await client.get("/api/v1/teams/dev/onboarding-candidates")

    assert response.status_code == 200
    assert [user["login"] for user in response.json()] == ["dev-revoked", "nowy-dev"]
    assert response.json()[1]["team"]["slug"] == "dev"


async def test_onboarding_candidates_for_unknown_team_return_404(client: AsyncClient) -> None:
    response = await client.get("/api/v1/teams/ops/onboarding-candidates")

    assert (response.status_code, response.json()) == (404, {"detail": "Team ops not found"})
