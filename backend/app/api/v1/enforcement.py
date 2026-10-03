from fastapi import APIRouter

from app.api.v1.deps import AdminIdDep, ClockDep, EnforcementDep, SessionDep, VCSDep
from app.schemas.enforcement import EnforcementModeRead, EnforcementModeUpdate
from app.services.enforcement_service import change_mode

router = APIRouter(prefix="/enforcement", tags=["enforcement"])


@router.get("/mode", response_model=EnforcementModeRead)
async def get_mode(state: EnforcementDep) -> EnforcementModeRead:
    return EnforcementModeRead(mode=state.mode)


@router.put("/mode", response_model=EnforcementModeRead)
async def put_mode(body: EnforcementModeUpdate, session: SessionDep, vcs: VCSDep, clock: ClockDep,
                   state: EnforcementDep, admin_id: AdminIdDep) -> EnforcementModeRead:
    """Switch disabled / warning / auto; auto acts on expired leases at once (docs/3-silnik-dzierzawy §5)."""
    await change_mode(session, vcs, state, mode=body.mode, now=clock.get_current_time(), actor_id=admin_id)
    await session.commit()
    return EnforcementModeRead(mode=state.mode)
