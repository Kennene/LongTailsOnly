"""Intentional friction for appeals (ADR 0005, ADR 0011 §5.3-5.4). Pure functions."""

from collections.abc import Iterable
from datetime import datetime, timedelta

from app.domain.enums import Role
from app.domain.lease_window import WARNING_WINDOW_DAYS


class JustificationError(ValueError):
    """Empty or reused justification; the service turns it into HTTP 422."""


def normalize_justification(text: str) -> str:
    return " ".join(text.split()).casefold()


def ensure_new_justification(text: str, previous: Iterable[str]) -> str:
    normalized = normalize_justification(text)
    if not normalized:
        raise JustificationError("Justification is required")
    if normalized in {normalize_justification(item) for item in previous}:
        raise JustificationError("Justification must be new; previous justifications cannot be reused")
    return text.strip()


def is_appealable(role: Role, expires_at: datetime | None, is_active: bool, now: datetime,
                  warning_days: int = WARNING_WINDOW_DAYS) -> bool:
    """Revoked access, or a leased role in its warning window or already expired."""
    if not is_active:
        return True
    if role is Role.ADMIN or expires_at is None:
        return False
    return expires_at - now <= timedelta(days=warning_days)
