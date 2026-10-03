"""Fixtures for the GitHub mock tests: a small org on main's `engine`, with a frozen clock.

The root `client`/`engine`/`session` fixtures come from tests/conftest.py. The clock override is
autouse only inside this directory so it cannot leak into other teams' tests.
"""
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.time_provider import TimeProvider, get_time_provider
from app.domain.enums import Role
from app.main import app
from app.models import Lease, Repository, Team, User

BASE = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
ORG = "longtails"
TTL = timedelta(days=30)


async def build_mini_org(session: AsyncSession) -> None:
    """tomasz-admin (org owner, no team), DEV: dev-01/dev-02, QA: qa-01, 3 repos, a few leases."""
    dev, qa = Team(slug="dev", name="DEV"), Team(slug="qa", name="QA")
    users = {
        "tomasz-admin": User(login="tomasz-admin", name="Tomasz", is_admin=True),
        "dev-01": User(login="dev-01", name="Dev One", team=dev),
        "dev-02": User(login="dev-02", name="Dev Two", team=dev),
        "qa-01": User(login="qa-01", name="QA One", team=qa),
    }
    repos = {n: Repository(name=n, owner=ORG, default_branch="main") for n in ("core-api", "auth-service", "frontend-app")}
    session.add_all([dev, qa, *users.values(), *repos.values()])
    await session.flush()
    for repo in repos.values():
        session.add(Lease(user_id=users["tomasz-admin"].id, repo_id=repo.id, current_role=Role.ADMIN, granted_at=BASE))
    session.add_all([
        Lease(user_id=users["dev-01"].id, repo_id=repos["core-api"].id, current_role=Role.WRITE, granted_at=BASE, expires_at=BASE + TTL),
        Lease(user_id=users["dev-02"].id, repo_id=repos["core-api"].id, current_role=Role.READ, granted_at=BASE, expires_at=BASE + TTL),
        Lease(user_id=users["qa-01"].id, repo_id=repos["frontend-app"].id, current_role=Role.READ, granted_at=BASE, expires_at=BASE + TTL),
    ])
    await session.commit()


@pytest.fixture
def clock() -> TimeProvider:
    return TimeProvider(base_time_source=lambda: BASE)


@pytest.fixture(autouse=True)
async def mini_org(engine: AsyncEngine, clock: TimeProvider) -> AsyncIterator[None]:
    app.dependency_overrides[get_time_provider] = lambda: clock
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        await build_mini_org(s)
    yield
    app.dependency_overrides.pop(get_time_provider, None)


@pytest.fixture
async def db(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        yield s
