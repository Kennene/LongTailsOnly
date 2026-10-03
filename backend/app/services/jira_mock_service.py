from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.jira_mock.http import JiraError
from app.core.config import Settings
from app.domain.enums import Provider, Role
from app.domain.jira_roles import JIRA_ROLES, JiraRole, account_id, role_by_id
from app.models import Lease, Repository, Team, User


class JiraMockService:
    """Read side of the Jira mock. Project role actors are the *active* leases of that role."""

    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.site = settings.jira_site

    async def projects(self) -> list[Repository]:
        query = select(Repository).where(Repository.provider == Provider.JIRA, Repository.owner == self.site)
        return list((await self.session.scalars(query.order_by(Repository.id))).all())

    async def project(self, key_or_id: str) -> Repository:
        condition = Repository.id == int(key_or_id) if key_or_id.isdigit() else Repository.name == key_or_id.upper()
        found = await self.session.scalar(
            select(Repository).where(condition, Repository.provider == Provider.JIRA, Repository.owner == self.site)
        )
        if found is None:
            raise JiraError(404, f"No project could be found with key '{key_or_id}'.")
        return found

    @staticmethod
    def role(role_id: int | str) -> JiraRole:
        found = role_by_id(int(role_id)) if str(role_id).isdigit() else None
        if found is None:
            raise JiraError(404, f"Project role with id '{role_id}' does not exist.")
        return found

    async def users(self) -> list[User]:
        return list((await self.session.scalars(select(User).order_by(User.id))).all())

    async def user_by_account(self, acc: str) -> User | None:
        return next((u for u in await self.users() if account_id(u.login) == acc), None)

    async def require_user(self, acc: str) -> User:
        user = await self.user_by_account(acc)
        if user is None:
            raise JiraError(404, f"The user with account id '{acc}' does not exist.")
        return user

    async def actors(self, project: Repository, role: Role) -> list[User]:
        query = (
            select(User).join(Lease, Lease.user_id == User.id)
            .where(Lease.repo_id == project.id, Lease.current_role == role, Lease.is_active)
            .order_by(User.id)
        )
        return list((await self.session.scalars(query)).all())

    async def role_names(self) -> list[JiraRole]:
        return list(JIRA_ROLES)

    async def groups(self) -> list[Team]:
        return list((await self.session.scalars(select(Team).order_by(Team.id))).all())

    async def group(self, name: str) -> Team:
        found = await self.session.scalar(select(Team).where(Team.name == name))
        if found is None:
            raise JiraError(404, f"The group '{name}' does not exist.")
        return found

    async def group_members(self, name: str) -> list[User]:
        team = await self.group(name)
        return list((await self.session.scalars(select(User).where(User.team_id == team.id).order_by(User.id))).all())
