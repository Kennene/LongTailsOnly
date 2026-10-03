from datetime import UTC, datetime

from httpx import AsyncClient

from app.core.time_provider import TimeProvider, get_time_provider
from app.main import app

NOW = datetime(2026, 10, 3, 15, 24, tzinfo=UTC)


async def test_clock_shows_real_day_before_time_travel(client: AsyncClient) -> None:
    app.dependency_overrides[get_time_provider] = lambda: TimeProvider(base_time_source=lambda: NOW)

    response = await client.get("/api/v1/simulation/clock")

    assert response.status_code == 200
    assert response.json() == {"simulated_now": "2026-10-03T15:24:00Z", "offset_days": 0}


async def test_clock_shows_simulated_day_after_time_travel(client: AsyncClient) -> None:
    clock = TimeProvider(base_time_source=lambda: NOW)
    clock.advance(15)
    app.dependency_overrides[get_time_provider] = lambda: clock

    body = (await client.get("/api/v1/simulation/clock")).json()

    assert body == {"simulated_now": "2026-10-18T15:24:00Z", "offset_days": 15}
