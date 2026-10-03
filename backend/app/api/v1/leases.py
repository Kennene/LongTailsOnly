"""Lease endpoints of the engine (step 3.6, docs/3-silnik-dzierzawy §6)."""

from fastapi import APIRouter

from app.api.v1.deps import AdminIdDep, ClockDep, SessionDep, VCSDep
from app.schemas.decision import DecisionRequest
from app.schemas.lease import LeaseActivityStats, LeaseOverview
from app.services.decision_service import decide_lease
from app.services.errors import LastAdminError
from app.services.lease_service import get_lease_overview, lease_activity_stats, list_lease_overviews

router = APIRouter(prefix="/leases", tags=["leases"])


@router.get("", response_model=list[LeaseOverview])
async def list_leases(session: SessionDep, clock: ClockDep) -> list[LeaseOverview]:
    return await list_lease_overviews(session, clock.get_current_time())


@router.get("/{lease_id}", response_model=LeaseOverview)
async def get_lease(lease_id: int, session: SessionDep, clock: ClockDep) -> LeaseOverview:
    return await get_lease_overview(session, lease_id, clock.get_current_time())


@router.post("/{lease_id}/decision", response_model=LeaseOverview)
async def decide(lease_id: int, body: DecisionRequest, session: SessionDep, clock: ClockDep, vcs: VCSDep,
                 admin_id: AdminIdDep) -> LeaseOverview:
    """Extend / downscope / revoke; 409 when the lease has a PENDING appeal (decide it via /appeals)."""
    now = clock.get_current_time()
    try:
        await decide_lease(session, vcs, lease_id=lease_id, decision=body, now=now, actor_id=admin_id)
    except LastAdminError:
        await session.commit()  # keep the LAST_ADMIN_BLOCKED audit entry; nothing else changed
        raise
    await session.commit()
    return await get_lease_overview(session, lease_id, now)


@router.get("/{lease_id}/activity-stats", response_model=LeaseActivityStats)
async def activity_stats(lease_id: int, session: SessionDep, clock: ClockDep) -> LeaseActivityStats:
    return await lease_activity_stats(session, lease_id, clock.get_current_time())
