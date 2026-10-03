"""Seeded demo through the real API (scenarios UC-2, UC-3, UC-4 from shared/scenarios), clock at 12:00 UTC."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from app.core.time_provider import TimeProvider, get_time_provider
from app.main import app

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def clock() -> Iterator[TimeProvider]:
    fixed = TimeProvider(base_time_source=lambda: NOW)
    app.dependency_overrides[get_time_provider] = lambda: fixed
    yield fixed
    app.dependency_overrides.pop(get_time_provider, None)


async def lease(client: AsyncClient, login: str, repo: str) -> tuple:
    rows = (await client.get("/api/v1/leases")).json()
    row = next(r for r in rows if (r["user"]["login"], r["repository"]["name"]) == (login, repo))
    return row["status"], row["days_remaining"], row["recommendation"]


async def test_uc2_downscope_and_uc3_warning_after_reset(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/demo/reset")).status_code == 200
    assert await lease(client, "kamil", "payment-service") == ("WARNING", 5, "DOWNSCOPE")
    assert await lease(client, "kamil", "core-api") == ("ACTIVE", 29, "KEEP")
    assert await lease(client, "marta", "qa-automation") == ("WARNING", 3, "KEEP")


async def test_uc4_lifecycle_with_time_travel(client: AsyncClient) -> None:
    await client.post("/api/v1/demo/reset")
    await client.post("/api/v1/simulation/time-travel", json={"days": 25})
    assert await lease(client, "kamil", "core-api") == ("WARNING", 4, "KEEP")
    await client.post("/api/v1/simulation/time-travel", json={"days": 5})
    assert await lease(client, "kamil", "core-api") == ("EXPIRED", -1, "REVOKE")


async def test_uc5_last_admin_steps_match_the_mock(client: AsyncClient) -> None:
    await client.post("/api/v1/demo/reset")
    base = "/api/v3/repos/longtails/payment-service/collaborators"
    codes = [
        (await client.delete(f"{base}/tomasz-admin")).status_code,
        (await client.put(f"{base}/kamil", json={"permission": "admin"})).status_code,
        (await client.delete(f"{base}/kamil")).status_code,
        (await client.delete(f"{base}/tomasz-admin")).status_code,
    ]
    assert codes == [403, 204, 204, 403]  # kamil already collaborates (write), so PUT updates: 204
