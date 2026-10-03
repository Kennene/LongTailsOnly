"""Mapping between GitHub permission names and the project's lease roles (ADR 0002).

Only `read | write | admin` are stored. `triage` and `maintain` are accepted (GitHub
vocabulary) but collapse to `read` / `write`; they are a post-MVP extension path.
"""
from typing import Literal

LeaseRole = Literal["admin", "write", "read"]
GitHubPermission = Literal["admin", "push", "pull"]

_FROM_GITHUB: dict[str, LeaseRole] = {
    "pull": "read",
    "triage": "read",
    "push": "write",
    "maintain": "write",
    "admin": "admin",
}
_TO_GITHUB: dict[LeaseRole, GitHubPermission] = {"admin": "admin", "write": "push", "read": "pull"}
_FLAGS: dict[LeaseRole, dict[str, bool]] = {
    "admin": dict(admin=True, maintain=True, push=True, triage=True, pull=True),
    "write": dict(admin=False, maintain=False, push=True, triage=True, pull=True),
    "read": dict(admin=False, maintain=False, push=False, triage=False, pull=True),
}
NO_PERMISSION: dict[str, bool] = dict(admin=False, maintain=False, push=False, triage=False, pull=False)


def from_github_permission(name: str) -> LeaseRole:
    try:
        return _FROM_GITHUB[name]
    except KeyError:
        raise ValueError(f"unknown GitHub permission: {name}") from None


def to_github_permission(role: LeaseRole) -> GitHubPermission:
    return _TO_GITHUB[role]


def to_role_name(role: LeaseRole) -> str:
    return role  # GitHub role_name for push/pull is "write"/"read"; admin stays "admin"


def permission_flags(role: LeaseRole) -> dict[str, bool]:
    return dict(_FLAGS[role])
