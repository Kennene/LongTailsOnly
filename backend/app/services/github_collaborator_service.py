"""PUT/DELETE collaborator for the GitHub mock, with Last Admin Protection (ADR 0004).

Collaborators are active `Lease` rows; removal sets `is_active=False` (ADR 0007, unique user+repo
means a later PUT reactivates the same row). The mock never writes `AuditLog`: decisions are audited by
the services that call it (lease/appeal services).
"""
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.github_mock.http import GitHubError
from app.core.config import Settings
from app.domain.enums import GitHubPermission, Role
from app.domain.roles import from_github, is_leased
from app.models import Lease, Repository, User
from app.ports.clock import ClockPort
from app.services.errors import LastAdminError
from app.services.github_mock_service import GitHubMockService, not_found
from app.services.last_admin_guard import ensure_not_last_admin

DOC = "collaborators/collaborators"


class GitHubCollaboratorService:
    def __init__(self, session: AsyncSession, settings: Settings, clock: ClockPort) -> None:
        self.session = session
        self.clock = clock
        self.reads = GitHubMockService(session, settings)

    async def _user(self, username: str) -> User:
        user = await self.session.scalar(select(User).where(User.login == username))
        if user is None:
            raise not_found(DOC)
        return user

    async def _lease(self, repo: Repository, user: User) -> Lease | None:
        return await self.session.scalar(
            select(Lease).where(Lease.repo_id == repo.id, Lease.user_id == user.id)
        )

    @staticmethod
    def _expiry(role: Role, now: datetime, repository: Repository) -> datetime | None:
        if not is_leased(role):
            return None
        return now + timedelta(days=repository.default_lease_duration_days)

    async def _guard_last_admin(self, repo: Repository, user: User, lease: Lease) -> None:
        """Shared Last Admin Protection (step 3.4), answered in GitHub's error format."""
        try:
            await ensure_not_last_admin(self.session, repository=repo, user=user, lease=lease)
        except LastAdminError as error:
            raise GitHubError(403, error.detail, DOC) from error

    async def set_permission(
        self, owner: str, repo: str, username: str, permission: str
    ) -> tuple[Literal["created", "updated"], Lease, Repository, User]:
        try:
            role: Role = from_github(GitHubPermission(permission))
        except ValueError:
            raise GitHubError(
                422, "Validation Failed", DOC,
                errors=[{"resource": "Collaborator", "field": "permission", "code": "invalid"}],
            ) from None
        repository = await self.reads.get_repo(owner, repo)
        user = await self._user(username)
        lease = await self._lease(repository, user)
        now = self.clock.get_current_time()
        expires = self._expiry(role, now, repository)
        outcome: Literal["created", "updated"]
        if lease is None:
            lease = Lease(
                user_id=user.id, repo_id=repository.id, current_role=role,
                granted_at=now, expires_at=expires, is_active=True,
            )
            self.session.add(lease)
            outcome = "created"
        elif not lease.is_active:  # re-granting after a revoke: same row, fresh lease
            lease.current_role, lease.granted_at, lease.expires_at, lease.is_active = role, now, expires, True
            outcome = "created"
        else:
            outcome = "updated"
            if lease.current_role is not role:
                if lease.current_role is Role.ADMIN:
                    await self._guard_last_admin(repository, user, lease)
                lease.current_role, lease.granted_at, lease.expires_at = role, now, expires
        await self.session.commit()
        return outcome, lease, repository, user

    async def remove(self, owner: str, repo: str, username: str) -> None:
        repository = await self.reads.get_repo(owner, repo)
        user = await self._user(username)
        lease = await self._lease(repository, user)
        if lease is None or not lease.is_active:
            return
        await self._guard_last_admin(repository, user, lease)
        lease.is_active = False
        await self.session.commit()
