import pytest

from app.domain.github_permissions import (
    from_github_permission,
    permission_flags,
    to_github_permission,
    to_role_name,
)


@pytest.mark.parametrize(
    ("name", "role"),
    [("pull", "read"), ("triage", "read"), ("push", "write"), ("maintain", "write"), ("admin", "admin")],
)
def test_permission_mapping_table(name: str, role: str) -> None:
    assert from_github_permission(name) == role


def test_unknown_permission_raises() -> None:
    with pytest.raises(ValueError):
        from_github_permission("bogus")


def test_roles_map_back_to_github_names() -> None:
    assert [to_github_permission(r) for r in ("admin", "write", "read")] == ["admin", "push", "pull"]
    assert [to_role_name(r) for r in ("admin", "write", "read")] == ["admin", "write", "read"]


def test_permission_flags() -> None:
    assert permission_flags("admin") == dict(admin=True, maintain=True, push=True, triage=True, pull=True)
    assert permission_flags("write") == dict(admin=False, maintain=False, push=True, triage=True, pull=True)
    assert permission_flags("read") == dict(admin=False, maintain=False, push=False, triage=False, pull=True)
