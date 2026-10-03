from datetime import UTC, datetime, timedelta

import pytest

from app.core.time_provider import TimeProvider

BASE = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def make_clock() -> TimeProvider:
    return TimeProvider(base_clock=lambda: BASE)


def test_current_time_uses_utc_and_offset() -> None:
    clock = make_clock()
    assert clock.get_current_time() == BASE
    assert clock.get_current_time().tzinfo is not None


def test_advance_moves_clock_by_requested_days() -> None:
    clock = make_clock()
    assert clock.advance(7) == BASE + timedelta(days=7)
    assert clock.advance(15) == BASE + timedelta(days=22)
    assert clock.offset_seconds == 22 * 86400


def test_reset_returns_to_base_time() -> None:
    clock = make_clock()
    clock.advance(30)
    assert clock.reset() == BASE
    assert clock.offset_seconds == 0


def test_advance_rejects_non_positive_days() -> None:
    with pytest.raises(ValueError):
        make_clock().advance(0)
