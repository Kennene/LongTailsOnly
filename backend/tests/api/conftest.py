from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.time_provider import TimeProvider
from app.db.session import init_db
from app.main import create_app
from app.models import Lease, Repository, User

BASE = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
ORG = "longtails"


async def build_mini_org(session: AsyncSession) -> None:
    """tomasz-admin (IT, org owner), 2 DEV, 1 QA, 3 repos, a handful of leases."""
    users = {
        "tomasz-admin": User(login="tomasz-admin", name="Tomasz", team="IT", is_admin=True),
        "dev-01": User(login="dev-01", name="Dev One", team="DEV", is_admin=False),
        "dev-02": User(login="dev-02", name="Dev Two", team="DEV", is_admin=False),
        "qa-01": User(login="qa-01", name="QA One", team="QA", is_admin=False),
    }
    repos = {n: Repository(name=n, owner=ORG, default_branch="main") for n in ("core-api", "auth-service", "frontend-app")}
    session.add_all([*users.values(), *repos.values()])
    await session.flush()
    for repo in repos.values():
        session.add(Lease(user_id=users["tomasz-admin"].id, repo_id=repo.id, current_role="admin", granted_at=BASE, expires_at=None))
    from datetime import timedelta

    ttl = timedelta(days=30)
    session.add_all([
        Lease(user_id=users["dev-01"].id, repo_id=repos["core-api"].id, current_role="write", granted_at=BASE, expires_at=BASE + ttl),
        Lease(user_id=users["dev-02"].id, repo_id=repos["core-api"].id, current_role="read", granted_at=BASE, expires_at=BASE + ttl),
        Lease(user_id=users["qa-01"].id, repo_id=repos["frontend-app"].id, current_role="read", granted_at=BASE, expires_at=BASE + ttl),
    ])
    await session.commit()


@pytest.fixture
def clock() -> TimeProvider:
    return TimeProvider(base_clock=lambda: BASE)


@pytest.fixture
async def app(tmp_path: Path, clock: TimeProvider) -> AsyncIterator[FastAPI]:
    settings = Settings(database_url=f"sqlite+aiosqlite:///{tmp_path / 'api.db'}", seed_demo=False)
    application = create_app(settings=settings, clock=clock)
    await init_db(application.state.engine)
    async with application.state.sessionmaker() as session:
        await build_mini_org(session)
    yield application
    await application.state.engine.dispose()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def db(app: FastAPI) -> AsyncIterator[AsyncSession]:
    async with app.state.sessionmaker() as session:
        yield session
