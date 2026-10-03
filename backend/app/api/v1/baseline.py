from fastapi import APIRouter

from app.api.v1.deps import ClockDep, SessionDep
from app.schemas.baseline import BaselineEntry
from app.schemas.people import UserRead
from app.services.baseline_service import get_team_baseline, list_onboarding_candidates, team_by_slug

router = APIRouter(prefix="/teams", tags=["baseline"])


@router.get("/{slug}/baseline", response_model=list[BaselineEntry])
async def team_baseline(slug: str, session: SessionDep, clock: ClockDep) -> list[BaselineEntry]:
    return await get_team_baseline(session, await team_by_slug(session, slug), clock.get_current_time())


@router.get("/{slug}/onboarding-candidates", response_model=list[UserRead])
async def onboarding_candidates(slug: str, session: SessionDep) -> list[UserRead]:
    return await list_onboarding_candidates(session, await team_by_slug(session, slug))
