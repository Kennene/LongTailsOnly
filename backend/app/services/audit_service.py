"""Append-only audit trail (M6, ADR 0014 §2, §5.7-5.8): this module only writes and reads."""

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActorType, AuditAction
from app.models import AuditLog, User
from app.schemas.audit import AuditEntry, AuditLogRead
from app.services.errors import ServiceError

DEFAULT_AUDIT_LIMIT = 200


def lease_target(owner: str, repo: str, login: str) -> str:
    """The single format of a lease target in the audit trail: `owner/repo:login`."""
    return f"{owner}/{repo}:{login}"


async def write_audit_event(
    session: AsyncSession,
    *,
    now: datetime,
    actor_type: ActorType,
    actor_id: int | None,
    action: AuditAction,
    target: str,
    details: dict[str, Any] | None = None,
    justification: str | None = None,
) -> AuditLog:
    entry = AuditLog(timestamp=now, actor_type=actor_type, actor_id=actor_id, action=action.value, target=target,
                     details=details or {}, justification=justification)
    session.add(entry)
    await session.flush()
    return entry


async def list_audit_entries(
    session: AsyncSession,
    *,
    actor_type: ActorType | None = None,
    action: AuditAction | None = None,
    actor_login: str | None = None,
    target: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = DEFAULT_AUDIT_LIMIT,
) -> list[AuditEntry]:
    if since is not None and until is not None and since > until:
        raise ServiceError(422, "'since' must not be later than 'until'")
    query = (select(AuditLog, User.login).outerjoin(User, AuditLog.actor_id == User.id)
             .order_by(AuditLog.timestamp.desc(), AuditLog.id.desc()).limit(limit))
    if actor_type is not None:
        query = query.where(AuditLog.actor_type == actor_type)
    if action is not None:
        query = query.where(AuditLog.action == action.value)
    if actor_login is not None:
        query = query.where(User.login == actor_login)
    if target is not None:
        query = query.where(AuditLog.target.icontains(target, autoescape=True))
    if since is not None:
        query = query.where(AuditLog.timestamp >= since)
    if until is not None:
        query = query.where(AuditLog.timestamp <= until)
    rows = (await session.execute(query)).all()
    return [AuditEntry(**AuditLogRead.model_validate(log).model_dump(), actor_login=login) for log, login in rows]
