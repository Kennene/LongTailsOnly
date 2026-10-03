"""Pydantic payloads that mirror the GitHub REST v3 JSON shapes used by the mock."""
import base64
from typing import Any

from pydantic import BaseModel

from app.domain.enums import Role
from app.domain.github_permissions import permission_flags, role_name
from app.models import ActivityEvent, Repository, User
from app.utils.dates import iso_z

ORG_ID = 1


def node_id(kind: str, number: int) -> str:
    return base64.b64encode(f"04:{kind}{number}".encode()).decode()


def api_url(base: str, path: str) -> str:
    return f"{base}/api/v3{path}"


class GHUser(BaseModel):
    login: str
    id: int
    node_id: str
    avatar_url: str
    gravatar_id: str = ""
    url: str
    html_url: str
    type: str = "User"
    site_admin: bool = False

    @classmethod
    def from_user(cls, user: User, base: str) -> GHUser:
        return cls(
            login=user.login, id=user.id, node_id=node_id("User", user.id),
            avatar_url=f"{base}/avatars/u/{user.id}", url=api_url(base, f"/users/{user.login}"),
            html_url=f"{base}/{user.login}",
        )


class GHOwner(BaseModel):
    login: str
    id: int = ORG_ID
    node_id: str = node_id("Organization", ORG_ID)
    url: str
    type: str = "Organization"


class GHRepo(BaseModel):
    id: int
    node_id: str
    name: str
    full_name: str
    private: bool = True
    visibility: str = "private"
    fork: bool = False
    description: str | None = None
    owner: GHOwner
    url: str
    html_url: str
    default_branch: str

    @classmethod
    def from_repo(cls, repo: Repository, base: str) -> GHRepo:
        full = f"{repo.owner}/{repo.name}"
        return cls(
            id=repo.id, node_id=node_id("Repository", repo.id), name=repo.name, full_name=full,
            owner=GHOwner(login=repo.owner, url=api_url(base, f"/orgs/{repo.owner}")),
            url=api_url(base, f"/repos/{full}"), html_url=f"{base}/{full}",
            default_branch=repo.default_branch,
        )


class GHTeam(BaseModel):
    id: int
    node_id: str
    name: str
    slug: str
    description: str | None = None
    privacy: str = "closed"
    permission: str = "pull"
    url: str
    html_url: str
    members_url: str
    repositories_url: str
    parent: Any | None = None

    @classmethod
    def build(cls, team_id: int, name: str, slug: str, org: str, base: str) -> GHTeam:
        team_url = api_url(base, f"/orgs/{org}/teams/{slug}")
        return cls(
            id=team_id, node_id=node_id("Team", team_id), name=name, slug=slug,
            description=f"{name} team", url=team_url, html_url=f"{base}/orgs/{org}/teams/{slug}",
            members_url=team_url + "/members{/member}", repositories_url=team_url + "/repos",
        )


class GHCollaborator(GHUser):
    permissions: dict[str, bool]
    role_name: str

    @classmethod
    def from_view(cls, user: User, role: Role | None, base: str) -> GHCollaborator:
        base_user = GHUser.from_user(user, base)
        return cls(**base_user.model_dump(), permissions=permission_flags(role), role_name=role_name(role))


class GHPermission(BaseModel):
    permission: str
    role_name: str
    user: GHCollaborator

    @classmethod
    def from_view(cls, user: User, role: Role | None, base: str) -> GHPermission:
        collaborator = GHCollaborator.from_view(user, role, base)
        return cls(permission=collaborator.role_name, role_name=collaborator.role_name, user=collaborator)


class GHInvitation(BaseModel):
    id: int
    node_id: str
    repository: GHRepo
    invitee: GHUser
    inviter: GHUser
    permissions: str
    created_at: str
    url: str

    @classmethod
    def build(cls, lease_id: int, repo: Repository, invitee: User, inviter: User, role: Role, created_at: str, base: str) -> GHInvitation:
        return cls(
            id=lease_id, node_id=node_id("RepositoryInvitation", lease_id),
            repository=GHRepo.from_repo(repo, base), invitee=GHUser.from_user(invitee, base),
            inviter=GHUser.from_user(inviter, base), permissions=role_name(role), created_at=created_at,
            url=api_url(base, f"/user/repository_invitations/{lease_id}"),
        )


class GHActor(BaseModel):
    id: int
    login: str
    display_login: str
    gravatar_id: str = ""
    url: str
    avatar_url: str


class GHEventRepo(BaseModel):
    id: int
    name: str
    url: str


class GHEvent(BaseModel):
    id: str
    type: str
    actor: GHActor
    repo: GHEventRepo
    payload: dict[str, Any]
    public: bool = False
    created_at: str

    @classmethod
    def build(cls, event: ActivityEvent, user: User, repo: Repository, payload: dict[str, Any], base: str) -> GHEvent:
        full = f"{repo.owner}/{repo.name}"
        return cls(
            id=str(10_000_000_000 + event.id), type=event.action_type.value,
            actor=GHActor(
                id=user.id, login=user.login, display_login=user.login,
                url=api_url(base, f"/users/{user.login}"), avatar_url=f"{base}/avatars/u/{user.id}",
            ),
            repo=GHEventRepo(id=repo.id, name=full, url=api_url(base, f"/repos/{full}")),
            payload=payload, created_at=iso_z(event.timestamp),
        )
