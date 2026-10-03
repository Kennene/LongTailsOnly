"""Appeals with intentional friction (ADR 0005, ADR 0010 §5.3-5.6)."""

from collections.abc import Sequence
from datetime import datetime, timedelta

from sqlalchemy import Row, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.appeal_rules import JustificationError, ensure_new_justification, is_appealable
from app.domain.enums import ActorType, AppealStatus, AuditAction
from app.domain.lease_window import days_remaining
from app.models import ActivityEvent, Appeal, Lease, User
from app.schemas.appeal import AppealOverview, AppealRead
from app.schemas.people import UserRead
from app.schemas.repository import RepositoryRead
from app.services.audit_service import lease_target, write_audit_event
from app.services.errors import ServiceError


def appeal_target(lease: Lease) -> str:
    return lease_target(lease.repository.owner, lease.repository.name, lease.user.login)


async def submit_appeal(session: AsyncSession, *, lease_id: int, justification: str, now: datetime) -> Appeal:
    lease = await session.get(Lease, lease_id)
    if lease is None:
        raise ServiceError(404, f"Lease {lease_id} not found")
    if not is_appealable(lease.current_role, lease.expires_at, lease.is_active, now):
        raise ServiceError(409, "Appeals are accepted only for revoked leases or leases expiring within 7 days")
    pending = await session.scalar(
        select(Appeal.id).where(Appeal.lease_id == lease_id, Appeal.status == AppealStatus.PENDING))
    if pending is not None:
        raise ServiceError(409, "This lease already has a pending appeal")
    previous = (await session.scalars(select(Appeal.justification).where(Appeal.user_id == lease.user_id))).all()
    try:
        text = ensure_new_justification(justification, previous)
    except JustificationError as error:
        raise ServiceError(422, str(error)) from error

    appeal = Appeal(lease=lease, user_id=lease.user_id, repo_id=lease.repo_id, requested_role=lease.current_role,
                    justification=text, status=AppealStatus.PENDING, created_at=now)
    session.add(appeal)
    await write_audit_event(session, now=now, actor_type=ActorType.USER, actor_id=lease.user_id,
                            action=AuditAction.APPEAL_SUBMITTED, target=appeal_target(lease),
                            details={"lease_id": lease.id}, justification=text)
    return appeal


async def reject_appeal(session: AsyncSession, *, appeal_id: int, now: datetime, actor_id: int,
                        justification: str) -> Appeal:
    appeal = await pending_appeal(session, appeal_id)
    appeal.status, appeal.resolved_at = AppealStatus.REJECTED, now
    await write_audit_event(session, now=now, actor_type=ActorType.ADMIN, actor_id=actor_id,
                            action=AuditAction.APPEAL_REJECTED, target=appeal_target(appeal.lease),
                            details={"appeal_id": appeal.id}, justification=justification)
    return appeal


async def pending_appeal(session: AsyncSession, appeal_id: int) -> Appeal:
    appeal = await session.get(Appeal, appeal_id)
    if appeal is None:
        raise ServiceError(404, f"Appeal {appeal_id} not found")
    if appeal.status is not AppealStatus.PENDING:
        raise ServiceError(409, "Appeal has already been resolved")
    return appeal


async def build_appeal_overviews(
    session: AsyncSession, appeals: Sequence[Appeal], now: datetime
) -> list[AppealOverview]:
    user_ids = {appeal.user_id for appeal in appeals}
    history = (await session.execute(
        select(Appeal.user_id, Appeal.created_at, Appeal.id).where(Appeal.user_id.in_(user_ids)))).all()
    return [await _overview(session, appeal, history, now) for appeal in appeals]


async def _overview(session: AsyncSession, appeal: Appeal, history: Sequence[Row], now: datetime) -> AppealOverview:
    lease = appeal.lease
    window_start = now - timedelta(days=lease.repository.default_lease_duration_days)
    recent = await session.scalar(select(func.count()).select_from(ActivityEvent).where(
        ActivityEvent.user_id == appeal.user_id, ActivityEvent.repo_id == appeal.repo_id,
        ActivityEvent.timestamp >= window_start, ActivityEvent.timestamp <= now))
    order = (appeal.created_at, appeal.id)
    return AppealOverview(
        **AppealRead.model_validate(appeal).model_dump(),
        user=UserRead.model_validate(lease.user),
        repository=RepositoryRead.model_validate(lease.repository),
        lease_role=lease.current_role,
        lease_expires_at=lease.expires_at,
        lease_is_active=lease.is_active,
        days_remaining=days_remaining(lease.expires_at, now),
        recent_activity_count=int(recent or 0),
        previous_appeals=sum(1 for user_id, created_at, appeal_id in history
                             if user_id == appeal.user_id and (created_at, appeal_id) < order),
    )


async def list_appeal_overviews(
    session: AsyncSession,
    *,
    now: datetime,
    login: str | None = None,
    lease_id: int | None = None,
    status: AppealStatus | None = None,
) -> list[AppealOverview]:
    query = select(Appeal).order_by(Appeal.created_at.desc(), Appeal.id.desc())
    if login is not None:
        user_id = await session.scalar(select(User.id).where(User.login == login))
        if user_id is None:
            raise ServiceError(404, f"User {login} not found")
        query = query.where(Appeal.user_id == user_id)
    if lease_id is not None:
        query = query.where(Appeal.lease_id == lease_id)
    if status is not None:
        query = query.where(Appeal.status == status)
    return await build_appeal_overviews(session, (await session.scalars(query)).all(), now)
