from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.v1.deps import EnforcementDep, SessionDep, VCSDep
from app.core.time_provider import TimeProvider, get_time_provider
from app.domain.enums import EnforcementMode
from app.schemas import ClockRead, SimulationClock, TimeTravelRequest
from app.services.enforcement_service import run_auto_enforcement

router = APIRouter(prefix="/api/v1/simulation", tags=["simulation"])

ClockDep = Annotated[TimeProvider, Depends(get_time_provider)]


def _state(clock: TimeProvider) -> ClockRead:
    return ClockRead(now=clock.get_current_time(), offset_days=clock.offset_days)


@router.get("/clock", response_model=SimulationClock)
async def simulation_clock(clock: ClockDep) -> SimulationClock:
    """Which demo day the panel is on (ADR 0011 §4): {"simulated_now", "offset_days"}."""
    return SimulationClock(simulated_now=clock.get_current_time(), offset_days=clock.offset_days)


@router.get("/time-travel", response_model=ClockRead)
async def get_time(clock: ClockDep) -> ClockRead:
    return _state(clock)


@router.post("/time-travel", response_model=ClockRead)
async def time_travel(body: TimeTravelRequest, clock: ClockDep, session: SessionDep, vcs: VCSDep,
                      enforcement: EnforcementDep) -> ClockRead:
    """Move the simulated clock forward by `days` (cumulative). Presets: 15 / 30 / 60.

    In `auto` enforcement mode expired leases are downscoped/revoked right after the jump (step 3.5).
    """
    clock.advance(body.days)
    if enforcement.mode is EnforcementMode.AUTO:
        await run_auto_enforcement(session, vcs, now=clock.get_current_time())
        await session.commit()
    return _state(clock)


@router.delete("/time-travel", response_model=ClockRead)
async def reset_time(clock: ClockDep) -> ClockRead:
    """Back to real time; data is untouched (use /api/v1/demo/reset to also reseed)."""
    clock.reset()
    return _state(clock)
