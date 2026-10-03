from datetime import UTC, datetime
from pathlib import Path

import httpx

from app.core.config import Settings
from app.core.time_provider import TimeProvider
from app.main import create_app

BASE = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def test_startup_seeds_demo_data_and_serves_mock(tmp_path: Path) -> None:
    settings = Settings(database_url=f"sqlite+aiosqlite:///{tmp_path / 'demo.db'}", seed_demo=True)
    app = create_app(settings, TimeProvider(base_clock=lambda: BASE))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            repos = (await c.get("/api/v3/orgs/longtails/repos", params={"per_page": 100})).json()
            assert len(repos) == 10
            teams = (await c.get("/api/v3/orgs/longtails/teams/dev/members", params={"per_page": 100})).json()
            assert len(teams) == 12
            r = await c.get("/api/v3/repos/longtails/payment-gw/collaborators/dev-kamil/permission")
            assert r.json()["permission"] == "write"
            events = (await c.get("/api/v3/repos/longtails/payment-gw/events")).json()
            assert any(e["type"] == "PullRequestReviewEvent" for e in events)


async def test_startup_without_seed_is_empty(tmp_path: Path) -> None:
    settings = Settings(database_url=f"sqlite+aiosqlite:///{tmp_path / 'empty.db'}", seed_demo=False)
    app = create_app(settings, TimeProvider(base_clock=lambda: BASE))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            assert (await c.get("/api/v3/orgs/longtails/repos")).json() == []


async def test_seeding_twice_on_same_database_does_not_duplicate(tmp_path: Path) -> None:
    settings = Settings(database_url=f"sqlite+aiosqlite:///{tmp_path / 'twice.db'}", seed_demo=True)
    for _ in range(2):
        app = create_app(settings, TimeProvider(base_clock=lambda: BASE))
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
                assert len((await c.get("/api/v3/orgs/longtails/repos", params={"per_page": 100})).json()) == 10
                members = (await c.get("/api/v3/orgs/longtails/members", params={"per_page": 100})).json()
                assert len(members) == 19
