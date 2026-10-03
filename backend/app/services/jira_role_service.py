"""Writes of Jira project role actors with Last Admin Protection (ADR 0004, 0016)."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.jira_mock.http import JiraError
from app.core.config import Settings
from app.domain.jira_roles import JiraRole
from app.models import Repository, User
from app.ports.clock import ClockPort
from app.services.access_leases import AccessLeaseService
from app.services.errors import LastAdminError
from app.services.jira_mock_service import JiraMockService


def _last_admin(exc: LastAdminError) -> JiraError:
    """The shared guard speaks of repositories; a Jira resource is a project."""
    return JiraError(403, exc.detail.replace("of the repository", "of the project"))


class JiraRoleService:
    def __init__(self, session: AsyncSession, settings: Settings, clock: ClockPort) -> None:
        self.reads = JiraMockService(session, settings)
        self.leases = AccessLeaseService(session, clock)

    async def _load(self, project_key: str, role_id: str) -> tuple[Repository, JiraRole]:
        return await self.reads.project(project_key), self.reads.role(role_id)

    async def _users(self, account_ids: list[str]) -> list[User]:
        return [await self.reads.require_user(acc) for acc in dict.fromkeys(account_ids)]

    async def add_actors(self, project_key: str, role_id: str, account_ids: list[str]) -> tuple[Repository, JiraRole]:
        project, role = await self._load(project_key, role_id)
        users = await self._users(account_ids)
        try:
            for user in users:
                await self.leases.grant(project, user, role.role)
        except LastAdminError as exc:
            raise _last_admin(exc) from None
        return project, role

    async def set_actors(self, project_key: str, role_id: str, account_ids: list[str]) -> tuple[Repository, JiraRole]:
        project, role = await self._load(project_key, role_id)
        desired = await self._users(account_ids)
        keep = {u.id for u in desired}
        try:
            for current in await self.reads.actors(project, role.role):
                if current.id not in keep:
                    await self.leases.revoke(project, current)
            for user in desired:
                await self.leases.grant(project, user, role.role)
        except LastAdminError as exc:
            raise _last_admin(exc) from None
        return project, role

    async def remove_actor(self, project_key: str, role_id: str, account_id: str) -> None:
        project, role = await self._load(project_key, role_id)
        user = await self.reads.require_user(account_id)
        if await self.leases.active_role(project, user) is not role.role:
            return  # not an actor of this role: nothing to remove (idempotent)
        try:
            await self.leases.revoke(project, user)
        except LastAdminError as exc:
            raise _last_admin(exc) from None
