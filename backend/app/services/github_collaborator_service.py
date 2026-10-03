"""PUT/DELETE collaborator for the GitHub mock, with Last Admin Protection (ADR 0004).

Collaborators are `Lease` rows. The mock never writes `AuditLog`: decisions are audited by
the services that call it (lease/appeal services).
"""
from datetime import timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.github_mock.http import GitHubError
from app.core.config import Settings
from app.core.time_provider import TimeProvider
from app.domain.github_permissions import LeaseRole, from_github_permission
from app.models import Lease, Repository, User
from app.services.github_mock_service import GitHubMockService, not_found

DOC = "collaborators/collaborators"


class GitHubCollaboratorService:
    def __init__(self, session: AsyncSession, settings: Settings, clock: TimeProvider) -> None:
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

    async def _guard_last_admin(self, repo: Repository, user: User, lease: Lease) -> None:
        owners = await self.session.scalar(select(func.count()).select_from(User).where(User.is_admin))
        if user.is_admin and owners == 1:
            raise GitHubError(403, "Cannot remove the last administrator of the organization", DOC)
        if lease.current_role != "admin":
            return
        admins = await self.session.scalar(
            select(func.count()).select_from(Lease).where(Lease.repo_id == repo.id, Lease.current_role == "admin")
        )
        if admins == 1:
            raise GitHubError(403, "Cannot remove the last administrator of the repository", DOC)

    async def set_permission(
        self, owner: str, repo: str, username: str, permission: str
    ) -> tuple[Literal["created", "updated"], Lease, Repository, User]:
        try:
            role: LeaseRole = from_github_permission(permission)
        except ValueError:
            raise GitHubError(
                422, "Validation Failed", DOC,
                errors=[{"resource": "Collaborator", "field": "permission", "code": "invalid"}],
            ) from None
        repository = await self.reads.get_repo(owner, repo)
        user = await self._user(username)
        lease = await self._lease(repository, user)
        now = self.clock.get_current_time()
        expires = None if role == "admin" else now + timedelta(days=repository.default_lease_duration_days)
        if lease is None:
            lease = Lease(user_id=user.id, repo_id=repository.id, current_role=role, granted_at=now, expires_at=expires)
            self.session.add(lease)
            outcome: Literal["created", "updated"] = "created"
        else:
            outcome = "updated"
            if lease.current_role != role:
                if lease.current_role == "admin":
                    await self._guard_last_admin(repository, user, lease)
                lease.current_role, lease.granted_at, lease.expires_at = role, now, expires
        await self.session.commit()
        return outcome, lease, repository, user

    async def remove(self, owner: str, repo: str, username: str) -> None:
        repository = await self.reads.get_repo(owner, repo)
        user = await self._user(username)
        lease = await self._lease(repository, user)
        if lease is None:
            return
        await self._guard_last_admin(repository, user, lease)
        await self.session.delete(lease)
        await self.session.commit()
