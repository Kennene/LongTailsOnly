from datetime import UTC, datetime, timedelta

import pytest

from app.domain.enums import LeaseStatus, Role
from app.domain.lease_rules import lease_days_remaining, lease_status

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
SECOND = timedelta(seconds=1)
DAYS_7 = timedelta(days=7)


@pytest.mark.parametrize(("expires_at", "expected"), [
    (NOW, LeaseStatus.EXPIRED),
    (NOW - timedelta(days=3), LeaseStatus.EXPIRED),
    (NOW + SECOND, LeaseStatus.WARNING),
    (NOW + DAYS_7, LeaseStatus.WARNING),
    (NOW + DAYS_7 + SECOND, LeaseStatus.ACTIVE),
])
def test_status_boundaries_against_the_clock(expires_at: datetime, expected: LeaseStatus) -> None:
    assert lease_status(Role.WRITE, expires_at, True, NOW) is expected


def test_revoked_wins_even_for_admin() -> None:
    assert lease_status(Role.ADMIN, None, False, NOW) is LeaseStatus.REVOKED
    assert lease_status(Role.READ, NOW + DAYS_7 * 3, False, NOW) is LeaseStatus.REVOKED


def test_admin_and_missing_expiry_are_permanent() -> None:
    assert lease_status(Role.ADMIN, None, True, NOW) is LeaseStatus.PERMANENT
    assert lease_status(Role.ADMIN, NOW - DAYS_7, True, NOW) is LeaseStatus.PERMANENT
    assert lease_status(Role.READ, None, True, NOW) is LeaseStatus.PERMANENT


@pytest.mark.parametrize(("expires_at", "expected"), [
    (NOW + SECOND, 1),
    (NOW + DAYS_7, 7),
    (NOW, 0),
    (NOW - timedelta(hours=5), 0),
    (NOW - timedelta(days=1, hours=5), -1),
])
def test_days_remaining_round_up(expires_at: datetime, expected: int) -> None:
    status = lease_status(Role.WRITE, expires_at, True, NOW)
    assert lease_days_remaining(status, expires_at, NOW) == expected


@pytest.mark.parametrize("status", [LeaseStatus.PERMANENT, LeaseStatus.REVOKED])
def test_days_remaining_is_none_without_expiry(status: LeaseStatus) -> None:
    assert lease_days_remaining(status, NOW + DAYS_7, NOW) is None
