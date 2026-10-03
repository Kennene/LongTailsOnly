import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.core.time_provider import TimeProvider
from app.db.bootstrap import prepare_database
from app.db.jira_seed import Ev, _issue, seed_jira_demo, specs
from app.domain.enums import ActionType, Provider
from app.domain.roles import required_permission_for
from app.models import ActivityEvent, Lease, Repository, User
from tests.integration.conftest import BASE


def clock() -> TimeProvider:
    return TimeProvider(base_time_source=lambda: BASE)


async def snapshot(engine: AsyncEngine) -> list[tuple[str, str, str, str]]:
    query = (
        select(Repository.name, User.login, ActivityEvent.action_type, ActivityEvent.timestamp)
        .join(User, User.id == ActivityEvent.user_id).join(Repository, Repository.id == ActivityEvent.repo_id)
        .where(Repository.provider == Provider.JIRA).order_by(ActivityEvent.id)
    )
    async with async_sessionmaker(engine)() as s:
        return [tuple(map(str, row)) for row in (await s.execute(query)).all()]  # type: ignore[misc]


async def test_seed_is_deterministic_and_idempotent(engine: AsyncEngine) -> None:
    c = clock()
    await prepare_database(engine, c)
    first = await snapshot(engine)
    assert first
    async with async_sessionmaker(engine)() as s:
        assert await seed_jira_demo(s, c) == 0
    assert await snapshot(engine) == first
    await prepare_database(engine, c, reset=True)
    assert await snapshot(engine) == first


async def test_seed_needs_the_base_seed(engine: AsyncEngine) -> None:
    async with async_sessionmaker(engine)() as s:
        assert await seed_jira_demo(s, clock()) == 0
        assert await s.scalar(select(func.count()).select_from(Repository)) == 0


async def test_jira_seed_does_not_touch_github_data(engine: AsyncEngine) -> None:
    await prepare_database(engine, clock())
    async with async_sessionmaker(engine)() as s:
        github_repos = await s.scalar(select(func.count()).select_from(Repository).where(Repository.provider == Provider.GITHUB))
        github_events = await s.scalar(
            select(func.count()).select_from(ActivityEvent).join(Repository).where(Repository.provider == Provider.GITHUB)
        )
        leases = (await s.scalars(select(Lease).join(Repository).where(Repository.provider == Provider.JIRA))).all()
    assert (github_repos, github_events) == (10, 67)
    assert leases and all(lease.expires_at is None for lease in leases if lease.current_role.value == "admin")


async def test_event_levels_match_roles_table(engine: AsyncEngine) -> None:
    await prepare_database(engine, clock())
    async with async_sessionmaker(engine)() as s:
        events = (await s.scalars(select(ActivityEvent).join(Repository).where(Repository.provider == Provider.JIRA))).all()
    assert all(e.required_permission is required_permission_for(e.action_type) for e in events)
    assert {e.action_type for e in events} == {
        ActionType.JIRA_ISSUE_CREATED, ActionType.JIRA_ISSUE_UPDATED,
        ActionType.JIRA_COMMENT_CREATED, ActionType.JIRA_PROJECT_UPDATED,
    }


def test_every_seed_issue_has_exactly_three_events() -> None:
    assert all(len(issue) == 3 for spec in specs() for issue in spec.issues)
    with pytest.raises(ValueError):
        _issue(Ev(ActionType.JIRA_ISSUE_UPDATED, 1))
