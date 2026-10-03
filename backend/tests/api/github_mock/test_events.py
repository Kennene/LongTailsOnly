from datetime import timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.github_events import EVENT_REQUIRED_PERMISSION
from app.models import ActivityEvent, Repository, User
from tests.api.conftest import BASE

URL = "/api/v3/repos/longtails/core-api/events"


async def add_event(db: AsyncSession, login: str, repo: str, kind: str, age_days: float) -> None:
    user = await db.scalar(select(User).where(User.login == login))
    repository = await db.scalar(select(Repository).where(Repository.name == repo))
    assert user is not None and repository is not None
    db.add(ActivityEvent(
        user_id=user.id, repo_id=repository.id, timestamp=BASE - timedelta(days=age_days),
        action_type=kind, required_permission=EVENT_REQUIRED_PERMISSION[kind],
    ))
    await db.commit()


async def test_events_endpoint_shape_and_order(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await add_event(db, "dev-01", "core-api", "PushEvent", 5)
    await add_event(db, "dev-02", "core-api", "PullRequestReviewEvent", 1)
    await add_event(db, "dev-01", "auth-service", "PushEvent", 2)  # other repo, must not leak
    r = await client.get(URL)
    assert r.status_code == 200
    events = r.json()
    assert [e["type"] for e in events] == ["PullRequestReviewEvent", "PushEvent"]
    e = events[1]
    assert isinstance(e["id"], str) and e["id"].isdigit()
    assert e["actor"]["login"] == "dev-01" and {"id", "display_login", "gravatar_id", "url", "avatar_url"} <= e["actor"].keys()
    assert e["repo"]["name"] == "longtails/core-api" and e["repo"]["url"].endswith("/api/v3/repos/longtails/core-api")
    assert e["created_at"] == "2026-09-28T12:00:00Z"
    assert e["public"] is False and e["payload"]["ref"] == "refs/heads/main"


async def test_events_window_is_90_days_after_time_travel(client: httpx.AsyncClient, db: AsyncSession, clock) -> None:
    await add_event(db, "dev-01", "core-api", "PushEvent", 80)
    await add_event(db, "dev-01", "core-api", "PushEvent", 10)
    assert len((await client.get(URL)).json()) == 2
    clock.advance(15)  # the 80-day-old event is now 95 days old
    assert len((await client.get(URL)).json()) == 1
    clock.advance(70)  # total +85 days: the 10-day-old event is now 95 days old
    assert (await client.get(URL)).json() == []


async def test_future_events_are_not_returned(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await add_event(db, "dev-01", "core-api", "PushEvent", -1)
    assert (await client.get(URL)).json() == []


async def test_events_capped_at_300(client: httpx.AsyncClient, db: AsyncSession) -> None:
    user = await db.scalar(select(User).where(User.login == "dev-01"))
    repo = await db.scalar(select(Repository).where(Repository.name == "core-api"))
    assert user is not None and repo is not None
    db.add_all(
        ActivityEvent(
            user_id=user.id, repo_id=repo.id, timestamp=BASE - timedelta(minutes=i),
            action_type="PushEvent", required_permission="write",
        )
        for i in range(305)
    )
    await db.commit()
    total = 0
    for page in range(1, 5):
        r = await client.get(URL, params={"per_page": 100, "page": page})
        total += len(r.json())
    assert total == 300


async def test_events_unknown_repo_404(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v3/repos/longtails/nope/events")).status_code == 404


async def test_events_paginated(client: httpx.AsyncClient, db: AsyncSession) -> None:
    for i in range(3):
        await add_event(db, "dev-01", "core-api", "PushEvent", i + 1)
    r = await client.get(URL, params={"per_page": 2})
    assert len(r.json()) == 2 and 'rel="next"' in r.headers["link"]
