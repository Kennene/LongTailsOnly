"""PUT/DELETE collaborator for the GitHub mock, with Last Admin Protection (ADR 0004).

Lease writes live in `AccessLeaseService`; this class only translates GitHub's vocabulary and errors.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.github_mock.http import GitHubError
from app.core.config import Settings
from app.domain.enums import GitHubPermission, Role
from app.domain.roles import from_github
from app.models import Lease, Repository, User
from app.ports.clock import ClockPort
from app.services.access_leases import AccessLeaseService, LastAdminError, Outcome
from app.services.github_mock_service import GitHubMockService, not_found

DOC = "collaborators/collaborators"
_LAST_ADMIN_MESSAGES = {
    "organization": "Cannot remove the last administrator of the organization",
    "resource": "Cannot remove the last administrator of the repository",
}


class GitHubCollaboratorService:
    def __init__(self, session: AsyncSession, settings: Settings, clock: ClockPort) -> None:
        self.session = session
        self.leases = AccessLeaseService(session, clock)
        self.reads = GitHubMockService(session, settings)

    async def _user(self, username: str) -> User:
        user = await self.session.scalar(select(User).where(User.login == username))
        if user is None:
            raise not_found(DOC)
        return user

    async def set_permission(
        self, owner: str, repo: str, username: str, permission: str
    ) -> tuple[Outcome, Lease, Repository, User]:
        try:
            role: Role = from_github(GitHubPermission(permission))
        except ValueError:
            raise GitHubError(
                422, "Validation Failed", DOC,
                errors=[{"resource": "Collaborator", "field": "permission", "code": "invalid"}],
            ) from None
        repository = await self.reads.get_repo(owner, repo)
        user = await self._user(username)
        try:
            outcome, lease = await self.leases.grant(repository, user, role)
        except LastAdminError as exc:
            raise GitHubError(403, _LAST_ADMIN_MESSAGES[exc.scope], DOC) from None
        return outcome, lease, repository, user

    async def remove(self, owner: str, repo: str, username: str) -> None:
        repository = await self.reads.get_repo(owner, repo)
        user = await self._user(username)
        try:
            await self.leases.revoke(repository, user)
        except LastAdminError as exc:
            raise GitHubError(403, _LAST_ADMIN_MESSAGES[exc.scope], DOC) from None
