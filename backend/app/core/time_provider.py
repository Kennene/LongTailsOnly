from collections.abc import Callable
from datetime import UTC, datetime, timedelta


def _system_utc() -> datetime:
    return datetime.now(UTC)


class TimeProvider:
    """Simulated clock: base clock (UTC) plus an in-memory offset (ADR 0003).

    This is the only place allowed to read the system clock.
    """

    def __init__(self, base_clock: Callable[[], datetime] = _system_utc) -> None:
        self._base_clock = base_clock
        self._offset = timedelta(0)

    def get_current_time(self) -> datetime:
        return self._base_clock() + self._offset

    def advance(self, days: int) -> datetime:
        if days < 1:
            raise ValueError("days must be >= 1")
        self._offset += timedelta(days=days)
        return self.get_current_time()

    def reset(self) -> datetime:
        self._offset = timedelta(0)
        return self.get_current_time()

    @property
    def offset_seconds(self) -> int:
        return int(self._offset.total_seconds())
