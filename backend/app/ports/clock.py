from datetime import datetime
from typing import Protocol, runtime_checkable


@runtime_checkable
class ClockPort(Protocol):
    """Domain logic asks this port for 'now' instead of the system clock (ADR 0003)."""

    def get_current_time(self) -> datetime: ...
