from app.domain.enums import ActionType, GitHubPermission, Role

_RANK: dict[Role, int] = {Role.READ: 0, Role.WRITE: 1, Role.ADMIN: 2}

_FROM_GITHUB: dict[GitHubPermission, Role] = {
    GitHubPermission.PULL: Role.READ,
    GitHubPermission.TRIAGE: Role.READ,
    GitHubPermission.PUSH: Role.WRITE,
    GitHubPermission.MAINTAIN: Role.WRITE,
    GitHubPermission.ADMIN: Role.ADMIN,
}

_TO_GITHUB: dict[Role, GitHubPermission] = {
    Role.READ: GitHubPermission.PULL,
    Role.WRITE: GitHubPermission.PUSH,
    Role.ADMIN: GitHubPermission.ADMIN,
}

_REQUIRED_PERMISSION: dict[ActionType, Role] = {
    ActionType.PUSH: Role.WRITE,
    ActionType.PR_REVIEW: Role.READ,
    ActionType.ISSUE_COMMENT: Role.READ,
}


def role_rank(role: Role) -> int:
    return _RANK[role]


def is_at_least(role: Role, minimum: Role) -> bool:
    return role_rank(role) >= role_rank(minimum)


def is_leased(role: Role) -> bool:
    """Admin is a permanent break-glass role (ADR 0002) and never expires."""
    return role is not Role.ADMIN


def from_github(permission: GitHubPermission) -> Role:
    return _FROM_GITHUB[permission]


def to_github(role: Role) -> GitHubPermission:
    return _TO_GITHUB[role]


def required_permission_for(action: ActionType) -> Role:
    return _REQUIRED_PERMISSION[action]
