from collections.abc import Callable
from datetime import UTC, datetime, timedelta


def _system_utc_now() -> datetime:
    return datetime.now(UTC)


class TimeProvider:
    """Simulated clock: real (or injected) UTC time shifted by an in-memory offset (ADR 0008)."""

    def __init__(self, base_time_source: Callable[[], datetime] = _system_utc_now) -> None:
        self._base_time_source = base_time_source
        self._offset = timedelta(0)

    @property
    def offset_days(self) -> int:
        return self._offset.days

    def get_current_time(self) -> datetime:
        base = self._base_time_source()
        if base.tzinfo is None:
            raise ValueError("Base time source must return a timezone-aware datetime")
        return base.astimezone(UTC) + self._offset

    def advance(self, days: int) -> datetime:
        if days <= 0:
            raise ValueError("Time travel only moves forward; use reset() to go back")
        self._offset += timedelta(days=days)
        return self.get_current_time()

    def reset(self) -> None:
        self._offset = timedelta(0)


time_provider = TimeProvider()


def get_time_provider() -> TimeProvider:
    return time_provider
