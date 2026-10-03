"""Temporary VCSProvider until the GitHub mock (step 2.3) lands: a collaborator is a Lease row (ADR 0007, 0010 §3).

Grants and restores access only. Never use it to demote or remove an admin - it has no Last Admin Protection.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import Role
from app.models import Lease, Repository, User
from app.ports.clock import ClockPort
from app.services.errors import ServiceError


class DatabaseVCSAdapter:
    def __init__(self, session: AsyncSession, clock: ClockPort) -> None:
        self._session = session
        self._clock = clock

    async def set_permission(self, owner: str, repo: str, username: str, role: Role) -> None:
        repository = await self._session.scalar(
            select(Repository).where(Repository.owner == owner, Repository.name == repo))
        user = await self._session.scalar(select(User).where(User.login == username))
        if repository is None or user is None:
            raise ServiceError(404, f"Unknown repository {owner}/{repo} or user {username}")
        now = self._clock.get_current_time()
        expires_at = None if role is Role.ADMIN else now + timedelta(days=repository.default_lease_duration_days)
        lease = await self._session.scalar(
            select(Lease).where(Lease.user_id == user.id, Lease.repo_id == repository.id))
        if lease is None:
            self._session.add(Lease(user=user, repository=repository, current_role=role, granted_at=now,
                                    expires_at=expires_at))
        else:
            lease.current_role, lease.granted_at, lease.expires_at, lease.is_active = role, now, expires_at, True
        await self._session.flush()
