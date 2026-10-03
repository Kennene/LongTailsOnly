"""Jira project roles and identities for the mock (ADR 0006, 0011).

Team-managed projects have three roles. They map 1:1 to the project's `Role`:
Viewer=read, Member=write, Administrator=admin.
"""
import uuid
from dataclasses import dataclass

from app.domain.enums import Role

_NAMESPACE = uuid.UUID("2c1f6d1e-6a63-4c37-9f2f-3b1f6e7a9c10")


@dataclass(frozen=True)
class JiraRole:
    id: int
    name: str
    role: Role
    description: str


JIRA_ROLES: tuple[JiraRole, ...] = (
    JiraRole(10200, "Viewer", Role.READ, "Can browse the project and comment"),
    JiraRole(10201, "Member", Role.WRITE, "Can create and edit issues"),
    JiraRole(10202, "Administrator", Role.ADMIN, "Can administer the project"),
)


def role_by_id(role_id: int) -> JiraRole | None:
    return next((r for r in JIRA_ROLES if r.id == role_id), None)


def role_for(role: Role) -> JiraRole:
    return next(r for r in JIRA_ROLES if r.role is role)


def account_id(login: str) -> str:
    """Stable Atlassian-style account id derived from the login (no extra column needed)."""
    return f"712020:{uuid.uuid5(_NAMESPACE, login)}"
