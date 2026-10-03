from fastapi import APIRouter

from app.api.v1.deps import ClockDep, SessionDep
from app.schemas.insights import PermissionGraph
from app.services.insights_service import get_permission_graph

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("", response_model=PermissionGraph)
async def permission_graph(session: SessionDep, clock: ClockDep, team: str | None = None) -> PermissionGraph:
    return await get_permission_graph(session, now=clock.get_current_time(), team=team)
