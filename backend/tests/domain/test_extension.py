from datetime import UTC, date, datetime, timedelta

from app.domain.lease_rules import extension_base, extension_expiry

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
DAY = timedelta(days=1)


def test_base_keeps_the_remaining_days_of_an_active_lease() -> None:
    assert extension_base(NOW + 3 * DAY, True, NOW) == NOW + 3 * DAY
    assert extension_base(NOW - 3 * DAY, True, NOW) == NOW


def test_base_of_a_revoked_lease_is_now() -> None:
    assert extension_base(NOW + 3 * DAY, False, NOW) == NOW


def test_days_are_added_to_the_base() -> None:
    assert extension_expiry(NOW + 3 * DAY, lease_days=30, days=14) == NOW + 17 * DAY


def test_multiplier_is_applied_to_the_repository_lease_period() -> None:
    assert extension_expiry(NOW, lease_days=30, multiplier=1.5) == NOW + 45 * DAY
    assert extension_expiry(NOW, lease_days=30, multiplier=2.0) == NOW + 60 * DAY


def test_until_date_keeps_access_through_that_whole_day() -> None:
    assert extension_expiry(NOW, lease_days=30, until=date(2026, 12, 31)) == datetime(2027, 1, 1, tzinfo=UTC)
