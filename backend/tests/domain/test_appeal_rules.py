from datetime import UTC, datetime, timedelta

import pytest

from app.domain.appeal_rules import JustificationError, ensure_new_justification, is_appealable, normalize_justification
from app.domain.enums import Role
from app.domain.lease_window import WARNING_WINDOW_DAYS, days_remaining

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def test_warning_window_is_seven_days() -> None:
    assert WARNING_WINDOW_DAYS == 7


def test_days_remaining_rounds_up_and_goes_negative() -> None:
    assert days_remaining(NOW + timedelta(days=2, hours=1), NOW) == 3
    assert days_remaining(NOW - timedelta(days=15), NOW) == -15
    assert days_remaining(None, NOW) is None


@pytest.mark.parametrize(("role", "expires_in", "is_active", "expected"), [
    (Role.WRITE, timedelta(days=7), True, True),
    (Role.WRITE, timedelta(days=7, seconds=1), True, False),
    (Role.READ, timedelta(days=-10), True, True),
    (Role.WRITE, timedelta(days=20), False, True),
    (Role.ADMIN, None, True, False),
])
def test_who_may_appeal(role: Role, expires_in: timedelta | None, is_active: bool, expected: bool) -> None:
    expires_at = None if expires_in is None else NOW + expires_in

    assert is_appealable(role, expires_at, is_active, NOW) is expected


def test_normalization_collapses_whitespace_and_case() -> None:
    assert normalize_justification("  Release   V2.1\n next\tweek ") == "release v2.1 next week"


def test_new_justification_is_returned_stripped() -> None:
    assert ensure_new_justification("  Hotfix for payment bug  ", ["Release v2.1"]) == "Hotfix for payment bug"


@pytest.mark.parametrize("blank", ["", "   ", "\n\t"])
def test_blank_justification_is_rejected(blank: str) -> None:
    with pytest.raises(JustificationError, match="required"):
        ensure_new_justification(blank, [])


@pytest.mark.parametrize("repeated", ["Release v2.1", "  release V2.1 ", "RELEASE\nv2.1"])
def test_repeated_justification_is_rejected(repeated: str) -> None:
    with pytest.raises(JustificationError, match="new"):
        ensure_new_justification(repeated, ["Hotfix", "Release v2.1"])
