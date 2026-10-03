from fastapi import APIRouter, Depends, Request

from app.core.time_provider import TimeProvider
from app.schemas.simulation import SimulationClock, TimeTravelRequest

router = APIRouter(prefix="/api/v1/simulation", tags=["simulation"])


def get_clock(request: Request) -> TimeProvider:
    return request.app.state.clock


def _state(clock: TimeProvider) -> SimulationClock:
    return SimulationClock(simulated_now=clock.get_current_time(), offset_seconds=clock.offset_seconds)


@router.get("/time-travel")
async def get_time(clock: TimeProvider = Depends(get_clock)) -> SimulationClock:
    return _state(clock)


@router.post("/time-travel")
async def time_travel(body: TimeTravelRequest, clock: TimeProvider = Depends(get_clock)) -> SimulationClock:
    if body.reset:
        clock.reset()
    else:
        assert body.days is not None  # guaranteed by the request validator
        clock.advance(body.days)
    return _state(clock)
