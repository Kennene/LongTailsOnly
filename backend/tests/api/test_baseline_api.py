from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_provider import TimeProvider, get_time_provider
from app.domain.enums import ActionType
from app.main import app
from tests.factories import make_event, make_repo, make_user

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
