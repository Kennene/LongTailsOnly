"""Fixtures for the Jira mock tests: a mini org with two Jira projects and a frozen clock.

Root `client`/`engine` come from tests/conftest.py; the clock override is autouse only in this directory.
"""
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.time_provider import TimeProvider, get_time_provider
from app.domain.enums import ActionType, Provider, Role
from app.domain.jira_roles import account_id, role_for
from app.domain.roles import required_permission_for
from app.main import app
from app.models import ActivityEvent, Lease, Repository, Team, User

BASE = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
SITE = "longtails"
TTL = timedelta(days=30)
API = "/rest/api/3"


def acc(login: str) -> str:
    return account_id(login)


def role_id(role: Role) -> int:
    return role_for(role).id


async def build_mini_org(session: AsyncSession) -> None:
    """tomasz-admin (org owner) Administrator on PAY and QA; PAY: dev-01 Member, dev-02 Viewer."""
    dev, qa = Team(slug="dev", name="DEV"), Team(slug="qa", name="QA")
    users = {
        "tomasz-admin": User(login="tomasz-admin", name="Tomasz", is_admin=True),
        "dev-01": User(login="dev-01", name="Dev One", team=dev),
        "dev-02": User(login="dev-02", name="Dev Two", team=dev),
        "qa-01": User(login="qa-01", name="QA One", team=qa),
    }
    projects = {k: Repository(name=k, owner=SITE, provider=Provider.JIRA) for k in ("PAY", "QA")}
    gh = Repository(name="core-api", owner="longtails")  # a GitHub repo must stay invisible to Jira
    session.add_all([dev, qa, *users.values(), *projects.values(), gh])
    await session.flush()
    for project in projects.values():
        session.add(Lease(user_id=users["tomasz-admin"].id, repo_id=project.id, current_role=Role.ADMIN, granted_at=BASE))
    session.add_all([
        Lease(user_id=users["dev-01"].id, repo_id=projects["PAY"].id, current_role=Role.WRITE, granted_at=BASE, expires_at=BASE + TTL),
        Lease(user_id=users["dev-02"].id, repo_id=projects["PAY"].id, current_role=Role.READ, granted_at=BASE, expires_at=BASE + TTL),
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


async def add_event(db: AsyncSession, login: str, project: str, action: ActionType, age_days: float) -> ActivityEvent:
    from sqlalchemy import select

    user = await db.scalar(select(User).where(User.login == login))
    repo = await db.scalar(select(Repository).where(Repository.name == project))
    assert user is not None and repo is not None
    event = ActivityEvent(
        user_id=user.id, repo_id=repo.id, timestamp=BASE - timedelta(days=age_days),
        action_type=action, required_permission=required_permission_for(action),
    )
    db.add(event)
    await db.commit()
    return event
