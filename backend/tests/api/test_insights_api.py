from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_provider import TimeProvider, get_time_provider
from app.main import app
from tests.insights_world import build_insights_world

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def fixed_clock() -> Iterator[None]:
    app.dependency_overrides[get_time_provider] = lambda: TimeProvider(base_time_source=lambda: NOW)
    yield


async def test_dashboard_stats_endpoint(client: AsyncClient, session: AsyncSession) -> None:
    await build_insights_world(session, NOW)

    body = (await client.get("/api/v1/dashboard/stats")).json()

    assert body == {"generated_at": "2026-10-03T12:00:00Z", "active": 1, "warning": 1, "expired": 1,
                    "expired_window_days": 30, "permanent": 1, "revoked": 1, "downscope_recommendations": 1,
                    "revoke_recommendations": 1, "pending_appeals": 1, "onboarding_candidates": 2}


async def test_graph_endpoint_returns_react_flow_payload(client: AsyncClient, session: AsyncSession) -> None:
    await build_insights_world(session, NOW)

    body = (await client.get("/api/v1/graph", params={"team": "qa"})).json()
    unknown = await client.get("/api/v1/graph", params={"team": "ops"})

    assert body["nodes"] == [
        {"id": "team:qa", "type": "team", "position": {"x": 0, "y": 0},
         "data": {"label": "QA", "team": "qa", "is_admin": False}},
        {"id": "user:marta", "type": "user", "position": {"x": 320, "y": 0},
         "data": {"label": "marta", "team": "qa", "is_admin": False}},
    ]
    assert [edge["id"] for edge in body["edges"]] == ["member:marta"]
    assert (unknown.status_code, unknown.json()) == (404, {"detail": "Team ops not found"})
