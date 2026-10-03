from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import Base
from app.db.seed_data import (
    ADMIN_GRANTED_DAYS_AGO, ADMIN_LOGIN, ADMIN_NAME, LEASE_DURATION_DAYS, LEASE_GRANTED_DAYS_AGO,
    REPOSITORIES, TEAM_MEMBERS, TEAMS, LeaseSpec, lease_specs,
)
from app.domain.enums import Role
from app.domain.roles import is_at_least, required_permission_for
from app.models import ActivityEvent, Lease, Repository, Team, User
from app.ports.clock import ClockPort

EVENT_HOUR = timedelta(hours=10)


def seed_anchor(clock: ClockPort) -> datetime:
    return clock.get_current_time().replace(hour=0, minute=0, second=0, microsecond=0)


def _event_time(anchor: datetime, days_ago: int) -> datetime:
    return anchor - timedelta(days=days_ago) + EVENT_HOUR


def _expires_at(spec: LeaseSpec, granted_at: datetime, anchor: datetime) -> datetime:
    """Lease runs 30 days from grant or from the latest activity at its level (ADR 0002)."""
    qualifying = [_event_time(anchor, e.days_ago) for e in spec.events
                  if is_at_least(required_permission_for(e.action), spec.role)]
    return max([granted_at, *qualifying]) + timedelta(days=LEASE_DURATION_DAYS)


async def seed_demo_data(session: AsyncSession, clock: ClockPort) -> None:
    if await session.scalar(select(User.id).where(User.login == ADMIN_LOGIN)) is not None:
        return
    anchor = seed_anchor(clock)

    teams = {slug: Team(slug=slug, name=name) for slug, name in TEAMS}
    users = {ADMIN_LOGIN: User(login=ADMIN_LOGIN, name=ADMIN_NAME, is_admin=True)}
    for slug, members in TEAM_MEMBERS.items():
        for login, name in members:
            users[login] = User(login=login, name=name, team=teams[slug], is_admin=False)
    repos = {name: Repository(name=name, owner=settings.github_org, default_branch="main")
             for name in REPOSITORIES}
    session.add_all([*teams.values(), *users.values(), *repos.values()])

    admin_granted = anchor - timedelta(days=ADMIN_GRANTED_DAYS_AGO)
    session.add_all([Lease(user=users[ADMIN_LOGIN], repository=repo, current_role=Role.ADMIN,
                           granted_at=admin_granted, expires_at=None) for repo in repos.values()])

    granted = anchor - timedelta(days=LEASE_GRANTED_DAYS_AGO)
    for spec in lease_specs():
        user, repo = users[spec.login], repos[spec.repo]
        session.add(Lease(user=user, repository=repo, current_role=spec.role, granted_at=granted,
                          expires_at=_expires_at(spec, granted, anchor)))
        session.add_all([ActivityEvent(user=user, repository=repo,
                                       timestamp=_event_time(anchor, e.days_ago), action_type=e.action,
                                       required_permission=required_permission_for(e.action))
                         for e in spec.events])
    await session.commit()


async def table_counts(session: AsyncSession) -> dict[str, int]:
    return {name: int(await session.scalar(select(func.count()).select_from(table)) or 0)
            for name, table in Base.metadata.tables.items()}
