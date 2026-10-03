"""Enforcement modes disabled / warning / auto (step 3.5, docs/3-silnik-dzierzawy §5)."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enforcement_mode import EnforcementState
from app.domain.enums import ActorType, AuditAction, EnforcementMode, LeaseStatus, Recommendation, Role
from app.models import Lease
from app.ports.vcs_provider import VCSProvider
from app.services.audit_service import write_audit_event
from app.services.decision_service import downscope_lease, revoke_lease
from app.services.errors import LastAdminError
from app.services.lease_service import list_lease_overviews

AUTO_DOWNSCOPE = "Tryb auto: dostęp wygasł bez pushy w oknie dostępu, zostaje dostęp do odczytu"
AUTO_REVOKE = "Tryb auto: dostęp wygasł bez aktywności w oknie dostępu"


@dataclass(frozen=True)
class AutoRunResult:
    downscoped: int
    revoked: int
    blocked: int


async def run_auto_enforcement(session: AsyncSession, vcs: VCSProvider, *, now: datetime) -> AutoRunResult:
    """Apply DOWNSCOPE/REVOKE to every expired non-admin lease as SYSTEM; a Last Admin block is audited and skipped."""
    downscoped = revoked = blocked = 0
    for view in await list_lease_overviews(session, now, mode=EnforcementMode.AUTO):
        if view.status is not LeaseStatus.EXPIRED or view.current_role is Role.ADMIN:
            continue
        lease = await session.get(Lease, view.id)
        assert lease is not None
        try:
            if view.recommendation is Recommendation.DOWNSCOPE:
                await downscope_lease(session, vcs, lease=lease, now=now, actor_id=None, justification=AUTO_DOWNSCOPE)
                downscoped += 1
            elif view.recommendation is Recommendation.REVOKE:
                await revoke_lease(session, vcs, lease=lease, now=now, actor_id=None, justification=AUTO_REVOKE)
                revoked += 1
        except LastAdminError:
            blocked += 1
    return AutoRunResult(downscoped=downscoped, revoked=revoked, blocked=blocked)


async def change_mode(session: AsyncSession, vcs: VCSProvider, state: EnforcementState, *, mode: EnforcementMode,
                      now: datetime, actor_id: int) -> AutoRunResult | None:
    """Switch the mode (audited); switching to auto enforces right away."""
    previous, state.mode = state.mode, mode
    await write_audit_event(session, now=now, actor_type=ActorType.ADMIN, actor_id=actor_id,
                            action=AuditAction.ENFORCEMENT_MODE_CHANGED, target="enforcement:mode",
                            details={"from": previous.value, "to": mode.value})
    return await run_auto_enforcement(session, vcs, now=now) if mode is EnforcementMode.AUTO else None
