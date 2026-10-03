from fastapi import APIRouter

from app.api.v1.deps import AdminIdDep, ClockDep, SessionDep, VCSDep
from app.schemas.baseline import OnboardingProposal
from app.services.baseline_service import apply_onboarding, get_onboarding_proposal

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("/{login}", response_model=OnboardingProposal)
async def onboarding_proposal(login: str, session: SessionDep, clock: ClockDep) -> OnboardingProposal:
    return await get_onboarding_proposal(session, login=login, now=clock.get_current_time())


@router.post("/{login}/apply", response_model=OnboardingProposal)
async def apply_proposal(login: str, session: SessionDep, clock: ClockDep, vcs: VCSDep,
                         admin_id: AdminIdDep) -> OnboardingProposal:
    proposal = await apply_onboarding(session, vcs, login=login, now=clock.get_current_time(), actor_id=admin_id)
    await session.commit()
    return proposal
