"""Lease time window shared by Persons 3 and 4 (ADR 0002, ADR 0010 §2): one source of truth for the 7 days."""

from datetime import datetime, timedelta
from math import ceil

WARNING_WINDOW_DAYS = 7
DAY = timedelta(days=1)


def days_remaining(expires_at: datetime | None, now: datetime) -> int | None:
    """Whole days left, rounded up; negative once expired; None for a permanent (admin) lease."""
    return None if expires_at is None else ceil((expires_at - now) / DAY)
