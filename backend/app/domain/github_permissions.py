"""GitHub-shaped permission flags for the mock (names mapping lives in `roles`, ADR 0006)."""
from app.domain.enums import Role

NO_PERMISSION: dict[str, bool] = dict(admin=False, maintain=False, push=False, triage=False, pull=False)
_FLAGS: dict[Role, dict[str, bool]] = {
    Role.ADMIN: dict(admin=True, maintain=True, push=True, triage=True, pull=True),
    Role.WRITE: dict(admin=False, maintain=False, push=True, triage=True, pull=True),
    Role.READ: dict(admin=False, maintain=False, push=False, triage=False, pull=True),
}


def permission_flags(role: Role | None) -> dict[str, bool]:
    return dict(NO_PERMISSION if role is None else _FLAGS[role])


def role_name(role: Role | None) -> str:
    """GitHub `role_name`: read/write/admin, or `none` for people without access."""
    return "none" if role is None else role.value
