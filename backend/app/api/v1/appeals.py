from fastapi import APIRouter

from app.api.v1.deps import AdminIdDep, ClockDep, SessionDep, VCSDep
from app.domain.enums import AppealStatus
from app.models import Appeal
from app.schemas.appeal import AppealCreate, AppealOverview, AppealRejectRequest
from app.schemas.decision import DecisionRequest
from app.services.appeal_service import (
    build_appeal_overviews, decide_appeal, list_appeal_overviews, reject_appeal, submit_appeal,
)
from app.services.errors import LastAdminError

router = APIRouter(prefix="/appeals", tags=["appeals"])


async def _overview(session: SessionDep, appeal: Appeal, clock: ClockDep) -> AppealOverview:
    (overview,) = await build_appeal_overviews(session, [appeal], clock.get_current_time())
    return overview


@router.get("", response_model=list[AppealOverview])
async def list_appeals(session: SessionDep, clock: ClockDep, login: str | None = None, lease_id: int | None = None,
                       status: AppealStatus | None = None) -> list[AppealOverview]:
    return await list_appeal_overviews(session, now=clock.get_current_time(), login=login, lease_id=lease_id,
                                       status=status)


@router.post("", response_model=AppealOverview, status_code=201)
async def create_appeal(body: AppealCreate, session: SessionDep, clock: ClockDep) -> AppealOverview:
    appeal = await submit_appeal(session, lease_id=body.lease_id, justification=body.justification,
                                 now=clock.get_current_time())
    await session.commit()
    return await _overview(session, appeal, clock)


@router.post("/{appeal_id}/reject", response_model=AppealOverview)
async def reject(appeal_id: int, body: AppealRejectRequest, session: SessionDep, clock: ClockDep,
                 admin_id: AdminIdDep) -> AppealOverview:
    appeal = await reject_appeal(session, appeal_id=appeal_id, now=clock.get_current_time(), actor_id=admin_id,
                                 justification=body.justification)
    await session.commit()
    return await _overview(session, appeal, clock)


@router.post("/{appeal_id}/decision", response_model=AppealOverview)
async def decide(appeal_id: int, body: DecisionRequest, session: SessionDep, clock: ClockDep, vcs: VCSDep,
                 admin_id: AdminIdDep) -> AppealOverview:
    """Extend / downscope / revoke the appealed lease and close the appeal; 409 if already resolved."""
    try:
        appeal = await decide_appeal(session, vcs, appeal_id=appeal_id, decision=body, now=clock.get_current_time(),
                                     actor_id=admin_id)
    except LastAdminError:
        await session.commit()  # keep the LAST_ADMIN_BLOCKED audit entry; the appeal stays PENDING
        raise
    await session.commit()
    return await _overview(session, appeal, clock)
