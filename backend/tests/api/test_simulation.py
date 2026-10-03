from datetime import UTC, datetime, timedelta

import httpx
import pytest

from tests.api.conftest import BASE

URL = "/api/v1/simulation/time-travel"


def parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


@pytest.mark.parametrize("days", [15, 30, 60, 7, 25, 35])
async def test_post_advance_presets_and_pitch_jumps(client: httpx.AsyncClient, days: int) -> None:
    r = await client.post(URL, json={"days": days})
    assert r.status_code == 200
    body = r.json()
    assert body["offset_seconds"] == days * 86400
    assert parse(body["simulated_now"]) == BASE + timedelta(days=days)


async def test_advances_accumulate(client: httpx.AsyncClient) -> None:
    await client.post(URL, json={"days": 15})
    r = await client.post(URL, json={"days": 30})
    assert r.json()["offset_seconds"] == 45 * 86400


async def test_reset_returns_to_base_time(client: httpx.AsyncClient) -> None:
    await client.post(URL, json={"days": 30})
    r = await client.post(URL, json={"reset": True})
    assert r.status_code == 200
    assert r.json()["offset_seconds"] == 0 and parse(r.json()["simulated_now"]) == BASE


async def test_get_returns_current_clock(client: httpx.AsyncClient) -> None:
    assert (await client.get(URL)).json()["offset_seconds"] == 0
    await client.post(URL, json={"days": 7})
    r = await client.get(URL)
    assert r.json()["offset_seconds"] == 7 * 86400
    assert parse(r.json()["simulated_now"]) == BASE + timedelta(days=7)


@pytest.mark.parametrize(
    "body",
    [{"days": 0}, {"days": -5}, {"days": "x"}, {"days": 366}, {}, {"days": 5, "reset": True}, {"reset": False}],
)
async def test_invalid_bodies_return_422(client: httpx.AsyncClient, body: dict) -> None:
    r = await client.post(URL, json=body)
    assert r.status_code == 422
    assert (await client.get(URL)).json()["offset_seconds"] == 0  # nothing moved


async def test_other_services_see_shifted_time(client: httpx.AsyncClient) -> None:
    before = int((await client.get("/api/v3/orgs/longtails/members")).headers["x-ratelimit-reset"])
    await client.post(URL, json={"days": 30})
    after = int((await client.get("/api/v3/orgs/longtails/members")).headers["x-ratelimit-reset"])
    assert after - before == 30 * 86400
