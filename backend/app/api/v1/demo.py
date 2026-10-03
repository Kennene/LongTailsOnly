from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings, get_settings
from app.core.enforcement_mode import EnforcementState, get_enforcement_state
from app.core.time_provider import TimeProvider, get_time_provider
from app.db.bootstrap import prepare_database
from app.db.session import get_engine
from app.schemas import DemoResetResult

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])


@router.post("/reset", response_model=DemoResetResult)
async def reset_demo(
    engine: Annotated[AsyncEngine, Depends(get_engine)],
    clock: Annotated[TimeProvider, Depends(get_time_provider)],
    settings: Annotated[Settings, Depends(get_settings)],
    enforcement: Annotated[EnforcementState, Depends(get_enforcement_state)],
) -> DemoResetResult:
    if not settings.enable_demo_reset:
        raise HTTPException(status_code=404, detail="Not Found")
    enforcement.reset()  # back to the default `warning` mode (docs/3-silnik-dzierzawy §5)
    clock.reset()  # before seeding: seed dates are anchored to the clock
    counts = await prepare_database(engine, clock, reset=True)
    return DemoResetResult(now=clock.get_current_time(), offset_days=clock.offset_days, counts=counts)
