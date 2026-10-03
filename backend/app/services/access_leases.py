"""Provider-neutral lease writes used by the GitHub and Jira mocks (ADR 0004, 0007, 0011).

A collaborator / project-role actor is an active `Lease`. Revoking sets `is_active=False` (the row
stays for audit and a later grant reactivates it). Mocks never write `AuditLog`: decisions are
audited by the services that call them.
"""
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import Role
from app.domain.roles import is_leased
from app.models import Lease, Repository, User
from app.ports.clock import ClockPort

Outcome = Literal["created", "updated"]


class LastAdminError(Exception):
    """The operation would leave an organization or a resource without an administrator."""

    def __init__(self, scope: Literal["organization", "resource"]) -> None:
        super().__init__(scope)
        self.scope = scope


class AccessLeaseService:
    def __init__(self, session: AsyncSession, clock: ClockPort) -> None:
        self.session = session
        self.clock = clock

    async def find(self, repository: Repository, user: User) -> Lease | None:
        return await self.session.scalar(
            select(Lease).where(Lease.repo_id == repository.id, Lease.user_id == user.id)
        )

    async def active_role(self, repository: Repository, user: User) -> Role | None:
        lease = await self.find(repository, user)
        return lease.current_role if lease is not None and lease.is_active else None

    @staticmethod
    def _expiry(role: Role, now: datetime, repository: Repository) -> datetime | None:
        if not is_leased(role):
            return None
        return now + timedelta(days=repository.default_lease_duration_days)

    async def guard_last_admin(self, repository: Repository, user: User, lease: Lease) -> None:
        owners = await self.session.scalar(select(func.count()).select_from(User).where(User.is_admin))
        if user.is_admin and owners == 1:
            raise LastAdminError("organization")
        if lease.current_role is not Role.ADMIN:
            return
        admins = await self.session.scalar(
            select(func.count()).select_from(Lease).where(
                Lease.repo_id == repository.id, Lease.current_role == Role.ADMIN, Lease.is_active
            )
        )
        if admins == 1:
            raise LastAdminError("resource")

    async def grant(self, repository: Repository, user: User, role: Role) -> tuple[Outcome, Lease]:
        """Create, reactivate or change a lease. Same role on an active lease is a no-op ("updated")."""
        lease = await self.find(repository, user)
        now = self.clock.get_current_time()
        expires = self._expiry(role, now, repository)
        outcome: Outcome
        if lease is None:
            lease = Lease(
                user_id=user.id, repo_id=repository.id, current_role=role,
                granted_at=now, expires_at=expires, is_active=True,
            )
            self.session.add(lease)
            outcome = "created"
        elif not lease.is_active:
            lease.current_role, lease.granted_at, lease.expires_at, lease.is_active = role, now, expires, True
            outcome = "created"
        else:
            outcome = "updated"
            if lease.current_role is not role:
                if lease.current_role is Role.ADMIN:
                    await self.guard_last_admin(repository, user, lease)
                lease.current_role, lease.granted_at, lease.expires_at = role, now, expires
        await self.session.commit()
        return outcome, lease

    async def revoke(self, repository: Repository, user: User) -> bool:
        """Deactivate the lease; returns False when there was nothing to revoke (idempotent)."""
        lease = await self.find(repository, user)
        if lease is None or not lease.is_active:
            return False
        await self.guard_last_admin(repository, user, lease)
        lease.is_active = False
        await self.session.commit()
        return True
