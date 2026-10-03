from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.time_provider import TimeProvider, get_time_provider
from app.schemas import ClockRead, TimeTravelRequest

router = APIRouter(prefix="/api/v1/simulation", tags=["simulation"])

ClockDep = Annotated[TimeProvider, Depends(get_time_provider)]


def _state(clock: TimeProvider) -> ClockRead:
    return ClockRead(now=clock.get_current_time(), offset_days=clock.offset_days)


@router.get("/time-travel", response_model=ClockRead)
async def get_time(clock: ClockDep) -> ClockRead:
    return _state(clock)


@router.post("/time-travel", response_model=ClockRead)
async def time_travel(body: TimeTravelRequest, clock: ClockDep) -> ClockRead:
    """Move the simulated clock forward by `days` (cumulative). Presets: 15 / 30 / 60."""
    clock.advance(body.days)
    return _state(clock)


@router.delete("/time-travel", response_model=ClockRead)
async def reset_time(clock: ClockDep) -> ClockRead:
    """Back to real time; data is untouched (use /api/v1/demo/reset to also reseed)."""
    clock.reset()
    return _state(clock)
