"""Admin and system decisions on a lease (docs/3-silnik-dzierzawy §5-6): access changes only through the VCS port."""

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActorType, AppealStatus, AuditAction, DecisionAction, Role
from app.domain.lease_rules import extension_base, extension_expiry
from app.models import Appeal, Lease
from app.ports.vcs_provider import VCSProvider
from app.schemas.decision import DecisionRequest
from app.services.audit_service import lease_target, write_audit_event
from app.services.errors import LastAdminError, ServiceError
from app.services.lease_service import get_lease
from app.utils.dates import iso_z


async def decide_lease(session: AsyncSession, vcs: VCSProvider, *, lease_id: int, decision: DecisionRequest,
                       now: datetime, actor_id: int) -> Lease:
    """Admin decision from the lease view; a lease with a PENDING appeal is decided through that appeal (409)."""
    lease = await get_lease(session, lease_id)
    pending = await session.scalar(
        select(Appeal.id).where(Appeal.lease_id == lease_id, Appeal.status == AppealStatus.PENDING))
    if pending is not None:
        raise ServiceError(409, f"Lease has a pending appeal; decide it via /api/v1/appeals/{pending}/decision")
    return await apply_lease_decision(session, vcs, lease=lease, decision=decision, now=now, actor_id=actor_id)


async def apply_lease_decision(session: AsyncSession, vcs: VCSProvider, *, lease: Lease, decision: DecisionRequest,
                               now: datetime, actor_id: int | None) -> Lease:
    """EXTEND / DOWNSCOPE / REVOKE on a lease (ADR 0011 §6); `actor_id=None` means the system (auto mode)."""
    match decision.action:
        case DecisionAction.EXTEND:
            return await extend_lease(session, vcs, lease=lease, decision=decision, now=now, actor_id=actor_id)
        case DecisionAction.DOWNSCOPE:
            return await downscope_lease(session, vcs, lease=lease, now=now, actor_id=actor_id,
                                         justification=decision.justification)
        case DecisionAction.REVOKE:
            return await revoke_lease(session, vcs, lease=lease, now=now, actor_id=actor_id,
                                      justification=decision.justification)


async def extend_lease(session: AsyncSession, vcs: VCSProvider, *, lease: Lease, decision: DecisionRequest,
                       now: datetime, actor_id: int | None) -> Lease:
    """Days or TTL multiplier added to the base, or an end date; a revoked lease comes back via the port."""
    extension = decision.extension
    if extension is None or lease.current_role is Role.ADMIN:
        raise ServiceError(422, "Only a read or write lease can be extended")
    base = extension_base(lease.expires_at, lease.is_active, now)
    new_end = extension_expiry(base, lease_days=lease.repository.default_lease_duration_days,
                               days=extension.preset_days or extension.custom_days,
                               multiplier=extension.multiplier, until=extension.until_date)
    if new_end <= base:
        raise ServiceError(422, "The new end of the lease must be later than the current one")
    before = _snapshot(lease)
    if not lease.is_active:
        await vcs.set_permission(lease.repository.owner, lease.repository.name, lease.user.login, lease.current_role)
        lease.is_active, lease.granted_at = True, now
    lease.expires_at = new_end
    await _audit(session, lease, now, actor_id, AuditAction.LEASE_EXTENDED, before,
                 (decision.justification or "").strip() or None,
                 extra={"extension": extension.model_dump(mode="json", exclude_none=True)})
    return lease


async def downscope_lease(session: AsyncSession, vcs: VCSProvider, *, lease: Lease, now: datetime,
                          actor_id: int | None, justification: str | None) -> Lease:
    """write -> read through the port; the read lease starts now for the repository's lease period."""
    reason = _required(justification)
    if not lease.is_active or lease.current_role is not Role.WRITE:
        raise ServiceError(422, "Only an active write lease can be downscoped to read")
    before = _snapshot(lease)
    await vcs.set_permission(lease.repository.owner, lease.repository.name, lease.user.login, Role.READ)
    lease.current_role, lease.granted_at = Role.READ, now
    lease.expires_at = now + timedelta(days=lease.repository.default_lease_duration_days)
    await _audit(session, lease, now, actor_id, AuditAction.LEASE_DOWNSCOPED, before, reason)
    return lease


async def revoke_lease(session: AsyncSession, vcs: VCSProvider, *, lease: Lease, now: datetime,
                       actor_id: int | None, justification: str | None) -> Lease:
    """Remove access through the port; Last Admin Protection blocks it with an audited 403."""
    reason = _required(justification)
    if not lease.is_active:
        raise ServiceError(409, "Lease is already revoked")
    before = _snapshot(lease)
    try:
        await vcs.remove_collaborator(lease.repository.owner, lease.repository.name, lease.user.login)
    except LastAdminError as error:
        await _audit(session, lease, now, actor_id, AuditAction.LAST_ADMIN_BLOCKED, before, reason,
                     extra={"error": error.detail})
        raise
    lease.is_active = False
    await _audit(session, lease, now, actor_id, AuditAction.LEASE_REVOKED, before, reason)
    return lease


def _required(justification: str | None) -> str:
    reason = (justification or "").strip()
    if not reason:
        raise ServiceError(422, "A justification is required to downscope or revoke access")
    return reason


def _snapshot(lease: Lease) -> dict[str, Any]:
    return {"role": lease.current_role.value, "expires_at": iso_z(lease.expires_at) if lease.expires_at else None,
            "is_active": lease.is_active}


async def _audit(session: AsyncSession, lease: Lease, now: datetime, actor_id: int | None, action: AuditAction,
                 before: dict[str, Any], justification: str | None, *, extra: dict[str, Any] | None = None) -> None:
    after = _snapshot(lease)
    details = {"lease_id": lease.id, "role_before": before["role"], "role_after": after["role"],
               "expires_before": before["expires_at"], "expires_after": after["expires_at"],
               "active_before": before["is_active"], "active_after": after["is_active"], **(extra or {})}
    await write_audit_event(session, now=now, actor_type=ActorType.ADMIN if actor_id is not None else ActorType.SYSTEM,
                            actor_id=actor_id, action=action, details=details, justification=justification,
                            target=lease_target(lease.repository.owner, lease.repository.name, lease.user.login))
