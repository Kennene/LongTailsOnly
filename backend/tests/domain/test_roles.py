import pytest

from app.domain.enums import ActionType, GitHubPermission, Role
from app.domain.roles import (
    from_github,
    is_at_least,
    is_leased,
    required_permission_for,
    role_rank,
    to_github,
)


def test_role_order_is_read_write_admin() -> None:
    assert role_rank(Role.READ) < role_rank(Role.WRITE) < role_rank(Role.ADMIN)
    assert is_at_least(Role.WRITE, Role.READ)
    assert not is_at_least(Role.READ, Role.WRITE)


def test_only_read_and_write_are_leased() -> None:
    assert is_leased(Role.READ)
    assert is_leased(Role.WRITE)
    assert not is_leased(Role.ADMIN)


@pytest.mark.parametrize(
    ("github", "domain"),
    [
        (GitHubPermission.PULL, Role.READ),
        (GitHubPermission.TRIAGE, Role.READ),
        (GitHubPermission.PUSH, Role.WRITE),
        (GitHubPermission.MAINTAIN, Role.WRITE),
        (GitHubPermission.ADMIN, Role.ADMIN),
    ],
)
def test_github_permission_maps_to_domain_role(github: GitHubPermission, domain: Role) -> None:
    assert from_github(github) is domain


def test_domain_role_maps_back_to_github() -> None:
    assert to_github(Role.READ) is GitHubPermission.PULL
    assert to_github(Role.WRITE) is GitHubPermission.PUSH
    assert to_github(Role.ADMIN) is GitHubPermission.ADMIN


def test_event_type_defines_required_permission() -> None:
    assert required_permission_for(ActionType.PUSH) is Role.WRITE
    assert required_permission_for(ActionType.PR_REVIEW) is Role.READ
    assert required_permission_for(ActionType.ISSUE_COMMENT) is Role.READ


def test_unknown_role_value_is_rejected() -> None:
    with pytest.raises(ValueError):
        Role("maintain")
