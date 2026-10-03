"""Pydantic payloads that mirror the Jira Cloud REST v3 JSON shapes used by the mock."""
from typing import Any

from pydantic import BaseModel

from app.domain.jira_roles import JiraRole, account_id
from app.models import Repository, User
from app.utils.dates import jira_dt
from datetime import datetime


def api(base: str, path: str) -> str:
    return f"{base}/rest/api/3{path}"


class JiraUser(BaseModel):
    self: str
    accountId: str
    accountType: str = "atlassian"
    emailAddress: str
    displayName: str
    active: bool = True
    timeZone: str = "Europe/Warsaw"
    avatarUrls: dict[str, str]

    @classmethod
    def from_user(cls, user: User, base: str) -> JiraUser:
        acc = account_id(user.login)
        return cls(
            self=api(base, f"/user?accountId={acc}"), accountId=acc, emailAddress=f"{user.login}@longtails.example",
            displayName=user.name, avatarUrls={"48x48": f"{base}/avatars/jira/{user.id}"},
        )


class JiraProject(BaseModel):
    self: str
    id: str
    key: str
    name: str
    projectTypeKey: str = "software"
    simplified: bool = True
    style: str = "next-gen"
    isPrivate: bool = False

    @classmethod
    def from_repo(cls, repo: Repository, base: str) -> JiraProject:
        return cls(self=api(base, f"/project/{repo.id}"), id=str(repo.id), key=repo.name, name=f"{repo.name} project")


class JiraRoleSummary(BaseModel):
    self: str
    name: str
    id: int
    description: str

    @classmethod
    def build(cls, role: JiraRole, base: str) -> JiraRoleSummary:
        return cls(self=api(base, f"/role/{role.id}"), name=role.name, id=role.id, description=role.description)


class RoleActor(BaseModel):
    id: int
    displayName: str
    type: str = "atlassian-user-role-actor"
    actorUser: dict[str, str]

    @classmethod
    def from_user(cls, user: User) -> RoleActor:
        return cls(id=user.id, displayName=user.name, actorUser={"accountId": account_id(user.login)})


class ProjectRole(BaseModel):
    self: str
    name: str
    id: int
    description: str
    actors: list[RoleActor]

    @classmethod
    def build(cls, project: Repository, role: JiraRole, users: list[User], base: str) -> ProjectRole:
        return cls(
            self=api(base, f"/project/{project.id}/role/{role.id}"), name=role.name, id=role.id,
            description=role.description, actors=[RoleActor.from_user(u) for u in users],
        )


class JiraGroup(BaseModel):
    name: str
    groupId: str
    self: str


class IssueRef(BaseModel):
    id: str
    key: str
    self: str
    fields: dict[str, Any] | None = None


class ChangelogItem(BaseModel):
    field: str
    fieldtype: str = "jira"
    fromString: str
    toString: str


class ChangelogEntry(BaseModel):
    id: str
    author: JiraUser
    created: str
    items: list[ChangelogItem]


def adf(text: str) -> dict[str, Any]:
    """Minimal Atlassian Document Format body."""
    return {"type": "doc", "version": 1, "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}


class JiraComment(BaseModel):
    id: str
    self: str
    author: JiraUser
    body: dict[str, Any]
    created: str
    updated: str

    @classmethod
    def build(cls, event_id: int, key: str, author: User, when: datetime, base: str) -> JiraComment:
        return cls(
            id=str(20_000 + event_id), self=api(base, f"/issue/{key}/comment/{20_000 + event_id}"),
            author=JiraUser.from_user(author, base), body=adf(f"Comment {event_id} on {key}"),
            created=jira_dt(when), updated=jira_dt(when),
        )
