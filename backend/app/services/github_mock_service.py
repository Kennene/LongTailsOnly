from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.github_mock.http import GitHubError
from app.core.config import Settings
from app.domain.github_permissions import LeaseRole
from app.models import Lease, Repository, User


@dataclass(frozen=True)
class CollaboratorView:
    user: User
    role: LeaseRole


@dataclass(frozen=True)
class TeamRef:
    id: int
    name: str
    slug: str


# Only DEV and QA are GitHub teams; other values of User.team (e.g. "IT") are team-less org members.
TEAMS: dict[str, TeamRef] = {
    "DEV": TeamRef(1, "DEV", "dev"),
    "QA": TeamRef(2, "QA", "qa"),
}


def not_found(doc_path: str = "") -> GitHubError:
    return GitHubError(404, "Not Found", doc_path)


class GitHubMockService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.org = settings.github_org

    def _check_org(self, org: str) -> None:
        if org != self.org:
            raise not_found("orgs/orgs")

    async def list_members(self, org: str) -> list[User]:
        self._check_org(org)
        return list((await self.session.scalars(select(User).order_by(User.id))).all())

    def list_teams(self, org: str) -> list[TeamRef]:
        self._check_org(org)
        return list(TEAMS.values())

    async def list_team_members(self, org: str, slug: str) -> list[User]:
        self._check_org(org)
        team = next((t for t in TEAMS.values() if t.slug == slug), None)
        if team is None:
            raise not_found("teams/members")
        query = select(User).where(User.team == team.name).order_by(User.id)
        return list((await self.session.scalars(query)).all())

    async def list_repos(self, org: str) -> list[Repository]:
        self._check_org(org)
        query = select(Repository).where(Repository.owner == org).order_by(Repository.id)
        return list((await self.session.scalars(query)).all())

    async def get_repo(self, owner: str, repo: str) -> Repository:
        found = await self.session.scalar(
            select(Repository).where(Repository.owner == owner, Repository.name == repo)
        )
        if found is None or owner != self.org:
            raise not_found("repos/repos#get-a-repository")
        return found

    async def list_collaborators(self, owner: str, repo: str) -> list[CollaboratorView]:
        repository = await self.get_repo(owner, repo)
        query = (
            select(User, Lease.current_role)
            .join(Lease, Lease.user_id == User.id)
            .where(Lease.repo_id == repository.id)
            .order_by(User.id)
        )
        return [CollaboratorView(u, role) for u, role in (await self.session.execute(query)).all()]  # type: ignore[arg-type]

    async def get_permission(self, owner: str, repo: str, username: str) -> tuple[User, LeaseRole | None]:
        repository = await self.get_repo(owner, repo)
        user = await self.session.scalar(select(User).where(User.login == username))
        if user is None:
            raise not_found("collaborators/collaborators#get-repository-permissions-for-a-user")
        role = await self.session.scalar(
            select(Lease.current_role).where(Lease.repo_id == repository.id, Lease.user_id == user.id)
        )
        return user, role  # type: ignore[return-value]
