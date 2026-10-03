from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.demo_data import load_demo_data
from app.db.demo_scenarios import REPOS
from app.models import ActivityEvent, Lease, Repository, User

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def lease(session: AsyncSession, login: str, repo: str) -> Lease | None:
    q = (
        select(Lease).join(User, User.id == Lease.user_id).join(Repository, Repository.id == Lease.repo_id)
        .where(User.login == login, Repository.name == repo)
    )
    return await session.scalar(q)


async def test_load_demo_data_builds_population(session: AsyncSession) -> None:
    await load_demo_data(session, NOW, "longtails")
    assert await session.scalar(select(func.count()).select_from(User)) == 1 + 12 + 6
    assert await session.scalar(select(func.count()).select_from(Repository)) == len(REPOS) == 10
    admin = await session.scalar(select(User).where(User.login == "tomasz-admin"))
    assert admin is not None and admin.is_admin and admin.team == "IT"
    assert await session.scalar(select(func.count()).select_from(User).where(User.is_admin)) == 1


async def test_load_demo_data_is_idempotent(session: AsyncSession) -> None:
    await load_demo_data(session, NOW, "longtails")
    counts = [await session.scalar(select(func.count()).select_from(m)) for m in (User, Repository, Lease, ActivityEvent)]
    await load_demo_data(session, NOW, "longtails")
    assert counts == [await session.scalar(select(func.count()).select_from(m)) for m in (User, Repository, Lease, ActivityEvent)]


async def test_admin_is_permanent_admin_everywhere(session: AsyncSession) -> None:
    await load_demo_data(session, NOW, "longtails")
    for repo in REPOS:
        got = await lease(session, "tomasz-admin", repo)
        assert got is not None and got.current_role == "admin" and got.expires_at is None


async def test_scenario_leases(session: AsyncSession) -> None:
    await load_demo_data(session, NOW, "longtails")
    a = await lease(session, "dev-kamil", "payment-gw")
    assert a is not None and a.current_role == "write"
    assert timedelta(days=11.5) <= a.expires_at - NOW <= timedelta(days=12)  # last push 18 days ago, TTL 30
    b = await lease(session, "qa-marta", "core-api")
    assert b is not None and b.current_role == "read"
    assert timedelta(days=2.5) <= b.expires_at - NOW <= timedelta(days=3)  # last comment 27 days ago
    assert await lease(session, "dev-new", "core-api") is None  # scenario D: no access
    legacy = await lease(session, "dev-01", "legacy-reports")
    assert legacy is not None and legacy.expires_at < NOW  # scenario C: expired, never used


async def test_mobile_app_reviewers_get_read_lease(session: AsyncSession) -> None:
    await load_demo_data(session, NOW, "longtails")
    got = await lease(session, "dev-03", "mobile-app")
    assert got is not None and got.current_role == "read"
    pusher = await lease(session, "dev-03", "core-api")
    assert pusher is not None and pusher.current_role == "write"


async def test_reload_at_a_later_time_does_not_duplicate(session: AsyncSession) -> None:
    await load_demo_data(session, NOW, "longtails")
    counts = [await session.scalar(select(func.count()).select_from(m)) for m in (Lease, ActivityEvent)]
    await load_demo_data(session, NOW + timedelta(hours=5), "longtails")  # e.g. server restart
    assert counts == [await session.scalar(select(func.count()).select_from(m)) for m in (Lease, ActivityEvent)]
