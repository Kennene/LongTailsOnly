"""Temporary VCSProvider until the GitHub mock (step 2.3) lands: a collaborator is a Lease row (ADR 0007, 0010 §3).

Grants, restores and removes access; removal goes through Last Admin Protection (step 3.4).
It still refuses to demote an admin (409).

The module also declares the `github` service descriptor and publishes it to
`app.ports.service_registry` at import time, so the catalog is fed by the adapter that
actually serves the service. The descriptor must stay identical to the `_BUILTIN` entry of
the same id; `register` raises `ValueError` at import on any difference.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import Role
from app.models import Lease, Repository, User
from app.ports.clock import ClockPort
from app.ports.service_registry import ServiceDescriptor, ServiceKind, register
from app.services.errors import ServiceError
from app.services.last_admin_guard import ensure_not_last_admin

GITHUB_DESCRIPTOR = ServiceDescriptor(
    id="github",
    name="GitHub",
    kind=ServiceKind.VCS,
    capabilities=("dashboard", "leases", "appeals", "baseline", "graph", "audit"),
    is_available=True,
)

register(GITHUB_DESCRIPTOR)


class DatabaseVCSAdapter:
    def __init__(self, session: AsyncSession, clock: ClockPort) -> None:
        self._session = session
        self._clock = clock

    async def _resolve(self, owner: str, repo: str, username: str) -> tuple[Repository, User]:
        repository = await self._session.scalar(
            select(Repository).where(Repository.owner == owner, Repository.name == repo))
        user = await self._session.scalar(select(User).where(User.login == username))
        if repository is None or user is None:
            raise ServiceError(404, f"Unknown repository {owner}/{repo} or user {username}")
        return repository, user

    async def set_permission(self, owner: str, repo: str, username: str, role: Role) -> None:
        repository, user = await self._resolve(owner, repo, username)
        now = self._clock.get_current_time()
        expires_at = None if role is Role.ADMIN else now + timedelta(days=repository.default_lease_duration_days)
        lease = await self._session.scalar(
            select(Lease).where(Lease.user_id == user.id, Lease.repo_id == repository.id))
        if lease is None:
            self._session.add(Lease(user=user, repository=repository, current_role=role, granted_at=now,
                                    expires_at=expires_at))
        elif lease.current_role is Role.ADMIN and role is not Role.ADMIN:
            raise ServiceError(409, "The temporary adapter cannot demote an admin (no Last Admin Protection)")
        else:
            lease.current_role, lease.granted_at, lease.expires_at, lease.is_active = role, now, expires_at, True
        await self._session.flush()

    async def remove_collaborator(self, owner: str, repo: str, username: str) -> None:
        repository, user = await self._resolve(owner, repo, username)
        lease = await self._session.scalar(
            select(Lease).where(Lease.user_id == user.id, Lease.repo_id == repository.id))
        if lease is None or not lease.is_active:
            return
        await ensure_not_last_admin(self._session, repository=repository, user=user, lease=lease)
        lease.is_active = False
        await self._session.flush()
