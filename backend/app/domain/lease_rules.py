"""Lease engine rules (docs/3-silnik-dzierzawy/DOCUMENTATION.md §3). Pure functions, no I/O."""

from datetime import datetime, timedelta

from app.domain.enums import LeaseStatus, Role
from app.domain.lease_window import WARNING_WINDOW_DAYS, days_remaining

_WITHOUT_EXPIRY = frozenset({LeaseStatus.PERMANENT, LeaseStatus.REVOKED})


def lease_status(role: Role, expires_at: datetime | None, is_active: bool, now: datetime) -> LeaseStatus:
    """3.1: the first matching rule wins - revoked, permanent, expired, warning (<= 7 days), active."""
    if not is_active:
        return LeaseStatus.REVOKED
    if role is Role.ADMIN or expires_at is None:
        return LeaseStatus.PERMANENT
    if expires_at <= now:
        return LeaseStatus.EXPIRED
    if expires_at - now <= timedelta(days=WARNING_WINDOW_DAYS):
        return LeaseStatus.WARNING
    return LeaseStatus.ACTIVE


def lease_days_remaining(status: LeaseStatus, expires_at: datetime | None, now: datetime) -> int | None:
    """Whole days left (rounded up), so WARNING is always 1-7 and EXPIRED <= 0; None without an expiry."""
    return None if status in _WITHOUT_EXPIRY else days_remaining(expires_at, now)
