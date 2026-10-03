"""Admin and system decisions on a lease (docs/3-silnik-dzierzawy §5-6): access changes only through the VCS port."""

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActorType, AuditAction, Role
from app.models import Lease
from app.ports.vcs_provider import VCSProvider
from app.services.audit_service import lease_target, write_audit_event
from app.services.errors import LastAdminError, ServiceError
from app.utils.dates import iso_z


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
