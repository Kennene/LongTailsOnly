from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.time_provider import TimeProvider, get_time_provider
from app.db.seed_data import REFRESH_IDLE_LOGINS, REFRESH_USER
from app.main import app
from app.models import ActivityEvent, User

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
NEW_LOGIN = REFRESH_USER[0]


@pytest.fixture(autouse=True)
def clock() -> Iterator[TimeProvider]:
    fixed = TimeProvider(base_time_source=lambda: NOW)
    app.dependency_overrides[get_time_provider] = lambda: fixed
    yield fixed


@pytest.fixture
async def seeded(client: AsyncClient) -> AsyncClient:
    assert (await client.post("/api/v1/demo/reset")).status_code == 200
    return client


async def test_first_refresh_fetches_one_additional_user(seeded: AsyncClient) -> None:
    response = await seeded.post("/api/v1/demo/refresh")

    assert response.status_code == 200
    body = response.json()
    assert body["events"] == []
    (added,) = body["added_users"]
    assert (added["login"], added["name"], added["is_admin"]) == (NEW_LOGIN, REFRESH_USER[1], False)
    assert added["team"]["slug"] == REFRESH_USER[2]

    members = (await seeded.get("/api/v3/orgs/longtails/members?per_page=100")).json()
    assert NEW_LOGIN in {member["login"] for member in members}
    candidates = (await seeded.get(f"/api/v1/teams/{REFRESH_USER[2]}/onboarding-candidates")).json()
    assert NEW_LOGIN in {candidate["login"] for candidate in candidates}


async def test_following_refreshes_record_activity_instead(seeded: AsyncClient, session: AsyncSession) -> None:
    await seeded.post("/api/v1/demo/refresh")
    events_before = len((await session.scalars(select(ActivityEvent.id))).all())
    idle_ids = set(await session.scalars(select(User.id).where(User.login.in_(REFRESH_IDLE_LOGINS))))

    for _ in range(3):
        body = (await seeded.post("/api/v1/demo/refresh")).json()
        assert body["added_users"] == []
        assert body["events"]
        assert idle_ids.isdisjoint(event["user_id"] for event in body["events"])
        assert {datetime.fromisoformat(event["timestamp"]) for event in body["events"]} == {NOW}
        events_now = len((await session.scalars(select(ActivityEvent.id))).all())
        assert events_now == events_before + len(body["events"])
        events_before = events_now
    assert len((await session.scalars(select(User.id))).all()) == 20


async def test_demo_reset_forgets_the_refreshed_user(seeded: AsyncClient) -> None:
    await seeded.post("/api/v1/demo/refresh")
    await seeded.post("/api/v1/demo/refresh")

    reset = await seeded.post("/api/v1/demo/reset")
    assert reset.json()["counts"]["users"] == 19

    again = (await seeded.post("/api/v1/demo/refresh")).json()
    assert [user["login"] for user in again["added_users"]] == [NEW_LOGIN]
    assert again["events"] == []


async def test_refresh_disabled_returns_404(seeded: AsyncClient) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(enable_demo_reset=False)
    response = await seeded.post("/api/v1/demo/refresh")
    assert response.status_code == 404
