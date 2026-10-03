import pytest

from app.domain.enums import GitHubPermission, Role
from app.domain.github_permissions import NO_PERMISSION, permission_flags, role_name
from app.domain.roles import from_github, to_github


@pytest.mark.parametrize(
    ("name", "role"),
    [("pull", Role.READ), ("triage", Role.READ), ("push", Role.WRITE), ("maintain", Role.WRITE), ("admin", Role.ADMIN)],
)
def test_permission_mapping_table(name: str, role: Role) -> None:
    assert from_github(GitHubPermission(name)) is role


def test_unknown_permission_raises() -> None:
    with pytest.raises(ValueError):
        GitHubPermission("bogus")


def test_roles_map_back_to_github_names() -> None:
    assert [to_github(r).value for r in (Role.ADMIN, Role.WRITE, Role.READ)] == ["admin", "push", "pull"]
    assert [role_name(r) for r in (Role.ADMIN, Role.WRITE, Role.READ, None)] == ["admin", "write", "read", "none"]


def test_permission_flags() -> None:
    assert permission_flags(Role.ADMIN) == dict(admin=True, maintain=True, push=True, triage=True, pull=True)
    assert permission_flags(Role.WRITE) == dict(admin=False, maintain=False, push=True, triage=True, pull=True)
    assert permission_flags(Role.READ) == dict(admin=False, maintain=False, push=False, triage=False, pull=True)
    assert permission_flags(None) == NO_PERMISSION
