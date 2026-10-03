"""Lease time window shared by Persons 3 and 4 (ADR 0002, ADR 0014 §2): one source of truth for the windows."""

from datetime import datetime, timedelta
from math import ceil

WARNING_WINDOW_DAYS = 7
EXPIRED_WINDOW_DAYS = 30
DAY = timedelta(days=1)


def days_remaining(expires_at: datetime | None, now: datetime) -> int | None:
    """Whole days left, rounded up: 0 on the day of expiry, negative after it; None for a permanent lease."""
    return None if expires_at is None else ceil((expires_at - now) / DAY)


def lapsed_within_window(days_remaining: int | None) -> bool:
    """Dashboard counter "Wygaśnięte" counts only leases lapsed no more than EXPIRED_WINDOW_DAYS days ago.

    Day granularity is deliberate: the panel speaks in whole days ("wygasła 3 dni temu"), and it is the
    only form of the rule the frontend can mirror exactly (fixtures and MSW shift `days_remaining`, not
    `expires_at`). Older lapses stay in the "Dostępy" table and in the audit log - the counter is an alarm.
    """
    return days_remaining is not None and days_remaining >= -EXPIRED_WINDOW_DAYS
