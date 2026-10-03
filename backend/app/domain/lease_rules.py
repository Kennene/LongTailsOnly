"""Lease engine rules (docs/3-silnik-dzierzawy/DOCUMENTATION.md §3). Pure functions, no I/O."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from app.domain.enums import ActionType, LeaseStatus, Recommendation, Role
from app.domain.lease_window import WARNING_WINDOW_DAYS, days_remaining
from app.domain.roles import is_at_least, is_leased, is_renewing, required_permission_for, role_rank

_WITHOUT_EXPIRY = frozenset({LeaseStatus.PERMANENT, LeaseStatus.REVOKED})
_LAPSING = frozenset({LeaseStatus.WARNING, LeaseStatus.EXPIRED})


@dataclass(frozen=True)
class Activity:
    """One action of a person in a repository (a projection of ActivityEvent)."""

    action: ActionType
    at: datetime


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


def renews(action: ActionType, lease_role: Role) -> bool:
    """3.2: a renewing action renews its own level and the lower ones, never a higher one; admin never expires."""
    return is_leased(lease_role) and is_renewing(action) and is_at_least(required_permission_for(action), lease_role)


def newest_activity(activity: Iterable[Activity], *, since: datetime | None, until: datetime) -> Activity | None:
    """Newest renewing action in [since, until]; on equal time the higher level wins (deterministic)."""
    candidates = [a for a in activity
                  if is_renewing(a.action) and a.at <= until and (since is None or a.at >= since)]
    return max(candidates, key=lambda a: (a.at, role_rank(required_permission_for(a.action))), default=None)


def recommend(status: LeaseStatus, role: Role, newest: ActionType | None) -> Recommendation:
    """3.3: only lapsing leases get advice - no activity → REVOKE, activity below the role → DOWNSCOPE."""
    if status not in _LAPSING:
        return Recommendation.KEEP
    if newest is None:
        return Recommendation.REVOKE
    return Recommendation.KEEP if renews(newest, role) else Recommendation.DOWNSCOPE


def extension_base(expires_at: datetime | None, is_active: bool, now: datetime) -> datetime:
    """EXTEND keeps the days an active lease still has; a revoked lease starts again from now."""
    return max(now, expires_at) if is_active and expires_at is not None else now


def extension_expiry(base: datetime, *, lease_days: int, days: int | None = None, multiplier: float | None = None,
                     until: date | None = None) -> datetime:
    """New end of a lease: base + N days, base + round(TTL x M) days, or the end of the given UTC day."""
    if until is not None:
        return datetime.combine(until + timedelta(days=1), time(0), tzinfo=UTC)
    if multiplier is not None:
        return base + timedelta(days=round(lease_days * multiplier))
    if days is None:
        raise ValueError("Choose days, a multiplier or a date")
    return base + timedelta(days=days)
