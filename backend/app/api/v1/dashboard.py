from fastapi import APIRouter

from app.api.v1.deps import ClockDep, SessionDep
from app.schemas.insights import DashboardStats
from app.services.insights_service import get_dashboard_stats

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def dashboard_stats(session: SessionDep, clock: ClockDep) -> DashboardStats:
    return await get_dashboard_stats(session, now=clock.get_current_time())
