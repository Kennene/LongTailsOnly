"""Shared test record factories (ADR 0014 §1). They only flush; tests commit when an HTTP call needs the data."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType, Role
from app.domain.roles import required_permission_for
from app.models import ActivityEvent, Lease, Repository, Team, User


async def make_team(session: AsyncSession, slug: str = "dev") -> Team:
    team = await session.scalar(select(Team).where(Team.slug == slug))
    if team is None:
        team = Team(slug=slug, name=slug.upper())
        session.add(team)
        await session.flush()
    return team


async def make_user(session: AsyncSession, login: str, *, team: str | None = "dev", is_admin: bool = False) -> User:
    user = User(login=login, name=login.capitalize(), is_admin=is_admin,
                team=await make_team(session, team) if team is not None else None)
    session.add(user)
    await session.flush()
    return user


async def make_repo(session: AsyncSession, name: str, *, lease_days: int = 30) -> Repository:
    repo = Repository(name=name, owner="longtails", default_branch="main", default_lease_duration_days=lease_days)
    session.add(repo)
    await session.flush()
    return repo


async def make_lease(session: AsyncSession, user: User, repo: Repository, role: Role, *, granted_at: datetime,
                     expires_at: datetime | None, is_active: bool = True) -> Lease:
    lease = Lease(user=user, repository=repo, current_role=role, granted_at=granted_at, expires_at=expires_at,
                  is_active=is_active)
    session.add(lease)
    await session.flush()
    return lease


async def make_event(session: AsyncSession, user: User, repo: Repository, action: ActionType,
                     timestamp: datetime) -> ActivityEvent:
    event = ActivityEvent(user=user, repository=repo, timestamp=timestamp, action_type=action,
                          required_permission=required_permission_for(action))
    session.add(event)
    await session.flush()
    return event
