from datetime import UTC, datetime, timedelta

import pytest

from app.core.time_provider import TimeProvider, get_time_provider, time_provider
from app.ports.clock import ClockPort

BASE = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def fixed_clock() -> TimeProvider:
    return TimeProvider(base_time_source=lambda: BASE)


def test_current_time_uses_utc_and_offset() -> None:
    clock = fixed_clock()
    assert clock.get_current_time() == BASE
    assert clock.get_current_time().tzinfo is UTC
    assert clock.offset_days == 0


def test_advance_moves_clock_by_requested_days() -> None:
    clock = fixed_clock()
    assert clock.advance(7) == BASE + timedelta(days=7)
    assert clock.get_current_time() == BASE + timedelta(days=7)
    assert clock.offset_days == 7


def test_advances_accumulate() -> None:
    clock = fixed_clock()
    clock.advance(25)
    clock.advance(35)
    assert clock.offset_days == 60


@pytest.mark.parametrize("days", [0, -5])
def test_advance_rejects_non_positive_days(days: int) -> None:
    with pytest.raises(ValueError):
        fixed_clock().advance(days)


def test_reset_returns_to_base_time() -> None:
    clock = fixed_clock()
    clock.advance(30)
    clock.reset()
    assert clock.get_current_time() == BASE
    assert clock.offset_days == 0


def test_naive_base_time_is_rejected() -> None:
    clock = TimeProvider(base_time_source=lambda: datetime(2026, 10, 3, 12, 0))
    with pytest.raises(ValueError, match="timezone"):
        clock.get_current_time()


def test_default_clock_follows_real_utc_time() -> None:
    before = datetime.now(UTC)
    current = TimeProvider().get_current_time()
    assert before <= current <= datetime.now(UTC)


def test_global_instance_is_a_clock_port() -> None:
    assert get_time_provider() is time_provider
    assert isinstance(time_provider, ClockPort)
