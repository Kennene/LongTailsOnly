import pytest

from app.domain.enums import ActionType, Role
from app.domain.lease_rules import renews

# Rows: action; columns: lease role read / write / admin (3.2: own level and lower, never higher; admin never expires).
MATRIX = [
    (ActionType.PUSH, (True, True, False)),
    (ActionType.PR_REVIEW, (True, False, False)),
    (ActionType.ISSUE_COMMENT, (True, False, False)),
    (ActionType.PR_MERGE, (False, False, False)),
    (ActionType.ISSUE_LABEL, (False, False, False)),
    (ActionType.REPO_SETTINGS, (False, False, False)),
]


@pytest.mark.parametrize(("action", "expected"), MATRIX)
def test_renewal_matrix(action: ActionType, expected: tuple[bool, bool, bool]) -> None:
    assert (renews(action, Role.READ), renews(action, Role.WRITE), renews(action, Role.ADMIN)) == expected
