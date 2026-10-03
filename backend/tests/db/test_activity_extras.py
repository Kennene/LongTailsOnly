from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.core.time_provider import TimeProvider
from app.db.activity_extras import EXTRA_ACTIONS, seed_activity_extras
from app.db.bootstrap import prepare_database
from app.domain.enums import ActionType
from app.domain.roles import is_renewing, required_permission_for
from app.models import ActivityEvent, Repository, User

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def clock() -> TimeProvider:
    return TimeProvider(base_time_source=lambda: NOW)


async def extras(engine: AsyncEngine) -> list[tuple[str, str, ActionType, datetime]]:
    query = (
        select(User.login, Repository.name, ActivityEvent.action_type, ActivityEvent.timestamp)
        .join(User, User.id == ActivityEvent.user_id).join(Repository, Repository.id == ActivityEvent.repo_id)
        .where(ActivityEvent.action_type.in_(EXTRA_ACTIONS)).order_by(ActivityEvent.timestamp, ActivityEvent.id)
    )
    async with async_sessionmaker(engine)() as s:
        return [tuple(r) for r in (await s.execute(query)).all()]  # type: ignore[misc]


async def test_extras_added_deterministically_and_never_renew(engine: AsyncEngine) -> None:
    await prepare_database(engine, clock())
    first = await extras(engine)
    assert first and {a for *_, a, _ in first} == set(EXTRA_ACTIONS)
    assert not any(is_renewing(a) for *_, a, _ in first)
    assert all(t <= NOW for *_, t in first)
    await prepare_database(engine, clock(), reset=True)
    assert await extras(engine) == first  # same seed, same clock => same history


async def test_extras_are_idempotent(engine: AsyncEngine) -> None:
    c = clock()
    await prepare_database(engine, c)
    before = await extras(engine)
    async with async_sessionmaker(engine)() as s:
        assert await seed_activity_extras(s, c) == 0
    assert await extras(engine) == before


async def test_extras_keep_scenario_c_silent_and_permissions_consistent(engine: AsyncEngine) -> None:
    await prepare_database(engine, clock())
    async with async_sessionmaker(engine)() as s:
        legacy = await s.scalar(
            select(func.count()).select_from(ActivityEvent).join(Repository).where(Repository.name == "legacy-reports")
        )
        events = (await s.scalars(select(ActivityEvent))).all()
    assert legacy == 0
    assert all(e.required_permission is required_permission_for(e.action_type) for e in events)
