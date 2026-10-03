from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.time_provider import TimeProvider
from app.db.seed import seed_demo_data, table_counts
from app.db.session import build_engine, init_db
from app.domain.enums import ActionType, Role
from app.domain.roles import is_at_least, required_permission_for
from app.models import ActivityEvent, Lease, Repository, Team, User

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
ANCHOR = datetime(2026, 10, 3, tzinfo=UTC)
CLOCK = TimeProvider(base_time_source=lambda: NOW)


async def _seeded(session: AsyncSession) -> AsyncSession:
    await seed_demo_data(session, CLOCK)
    return session


async def _lease(session: AsyncSession, login: str, repo: str) -> Lease:
    query = select(Lease).join(User).join(Repository).where(User.login == login, Repository.name == repo)
    return (await session.execute(query)).scalar_one()


async def _events(session: AsyncSession, login: str, repo: str) -> list[ActivityEvent]:
    query = (select(ActivityEvent).join(User).join(Repository)
             .where(User.login == login, Repository.name == repo))
    return list((await session.execute(query)).scalars())


async def test_seed_creates_demo_population(session: AsyncSession) -> None:
    await _seeded(session)
    admins = (await session.execute(select(User.login).where(User.is_admin))).scalars().all()
    assert admins == ["tomasz-admin"]
    assert set((await session.execute(select(Team.slug))).scalars()) == {"dev", "qa"}
    counts = await table_counts(session)
    assert counts["users"] == 19 and counts["repositories"] == 10
    owners = set((await session.execute(select(Repository.owner))).scalars())
    assert owners == {"longtails"}


async def test_admin_is_permanent_on_every_repository(session: AsyncSession) -> None:
    await _seeded(session)
    admin_leases = (await session.execute(select(Lease).where(Lease.current_role == Role.ADMIN))).scalars().all()
    assert len(admin_leases) == 10
    assert {lease.user.login for lease in admin_leases} == {"tomasz-admin"}
    assert all(lease.expires_at is None for lease in admin_leases)


async def test_kamil_pushes_daily_in_two_repos_only(session: AsyncSession) -> None:
    await _seeded(session)
    query = (select(Repository.name).join(ActivityEvent).join(User)
             .where(User.login == "kamil", ActivityEvent.action_type == ActionType.PUSH,
                    ActivityEvent.timestamp >= ANCHOR - timedelta(days=7)).distinct())
    assert set((await session.execute(query)).scalars()) == {"core-api", "auth-service"}
    count = await session.scalar(select(func.count()).select_from(Lease).join(User)
                                 .where(User.login == "kamil", Lease.current_role == Role.WRITE))
    assert count == 10


async def test_scenario_a_write_without_recent_push(session: AsyncSession) -> None:
    await _seeded(session)
    events = await _events(session, "kamil", "payment-service")
    last_push = max(e.timestamp for e in events if e.action_type is ActionType.PUSH)
    assert (ANCHOR - last_push).days == 24  # 25 days ago at 10:00
    assert any(e.action_type is ActionType.PR_REVIEW and e.timestamp > last_push for e in events)


async def test_scenario_b_marta_expires_in_three_days(session: AsyncSession) -> None:
    await _seeded(session)
    lease = await _lease(session, "marta", "qa-automation")
    assert lease.current_role is Role.READ
    assert lease.expires_at is not None and (lease.expires_at - ANCHOR).days == 3


async def test_scenario_c_legacy_repo_has_no_events(session: AsyncSession) -> None:
    await _seeded(session)
    count = await session.scalar(select(func.count()).select_from(ActivityEvent).join(Repository)
                                 .where(Repository.name == "legacy-reports"))
    assert count == 0


async def test_scenario_d_new_developer_has_no_access(session: AsyncSession) -> None:
    await _seeded(session)
    user = (await session.execute(select(User).where(User.login == "nowy-dev"))).scalar_one()
    assert user.team is not None and user.team.slug == "dev"
    assert await session.scalar(select(func.count()).select_from(Lease).where(Lease.user_id == user.id)) == 0


async def test_dev_baseline_has_data_above_and_below_threshold(session: AsyncSession) -> None:
    await _seeded(session)

    async def active_devs(repo: str) -> int:
        query = (select(func.count(func.distinct(ActivityEvent.user_id)))
                 .select_from(ActivityEvent)
                 .join(User, ActivityEvent.user_id == User.id).join(Team, User.team_id == Team.id)
                 .join(Repository, ActivityEvent.repo_id == Repository.id)
                 .where(Team.slug == "dev", Repository.name == repo,
                        ActivityEvent.timestamp >= ANCHOR - timedelta(days=30)))
        return int(await session.scalar(query) or 0)

    assert await active_devs("core-api") >= 6
    assert await active_devs("auth-service") >= 6
    assert await active_devs("frontend-app") < 6


async def test_lease_expiry_matches_activity(session: AsyncSession) -> None:
    await _seeded(session)
    leases = (await session.execute(select(Lease).where(Lease.current_role != Role.ADMIN))).scalars().all()
    for lease in leases:
        events = await _events(session, lease.user.login, lease.repository.name)
        qualifying = [e.timestamp for e in events
                      if is_at_least(e.required_permission, lease.current_role)]
        expected = max([lease.granted_at, *qualifying]) + timedelta(days=30)
        assert lease.expires_at == expected, f"{lease.user.login}/{lease.repository.name}"


async def test_events_are_in_the_past_and_consistent(session: AsyncSession) -> None:
    await _seeded(session)
    for event in (await session.execute(select(ActivityEvent))).scalars():
        assert event.timestamp < NOW
        assert event.required_permission is required_permission_for(event.action_type)


async def test_seed_is_idempotent(session: AsyncSession) -> None:
    await _seeded(session)
    first = await table_counts(session)
    await _seeded(session)
    assert await table_counts(session) == first


async def test_seed_is_deterministic(session: AsyncSession, tmp_path: Path) -> None:
    other_engine = build_engine(f"sqlite+aiosqlite:///{(tmp_path / 'other.db').as_posix()}")
    await init_db(other_engine)

    async def snapshot(db: AsyncSession) -> list[tuple[str, str, str, datetime]]:
        rows = await db.execute(select(User.login, Repository.name, ActivityEvent.action_type,
                                       ActivityEvent.timestamp)
                                .select_from(ActivityEvent)
                                .join(User, ActivityEvent.user_id == User.id)
                                .join(Repository, ActivityEvent.repo_id == Repository.id)
                                .order_by(ActivityEvent.id))
        return [tuple(row) for row in rows]

    await _seeded(session)
    async with async_sessionmaker(other_engine, expire_on_commit=False)() as other:
        await seed_demo_data(other, CLOCK)
        assert await snapshot(other) == await snapshot(session)
    await other_engine.dispose()
