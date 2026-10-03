"""Lease engine service (docs/3-silnik-dzierzawy/DOCUMENTATION.md §3): activity, statuses and recommendations."""

from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enforcement_mode import enforcement_state
from app.domain.enums import ActionType, EnforcementMode, Recommendation
from app.domain.lease_rules import Activity, lease_days_remaining, lease_status, newest_activity, recommend, renews
from app.domain.roles import RENEWING_ACTIONS, required_permission_for
from app.models import ActivityEvent, Lease
from app.schemas.lease import LeaseOverview, LeaseRead
from app.services.errors import ServiceError

ActivityByLease = dict[tuple[int, int], list[Activity]]


async def record_activity(session: AsyncSession, *, user_id: int, repo_id: int, action: ActionType,
                          occurred_at: datetime) -> ActivityEvent:
    """Append the event; when it renews the person's active lease, push the expiry (never shortening it)."""
    event = ActivityEvent(user_id=user_id, repo_id=repo_id, timestamp=occurred_at, action_type=action,
                          required_permission=required_permission_for(action))
    session.add(event)
    lease = await session.scalar(select(Lease).where(Lease.user_id == user_id, Lease.repo_id == repo_id))
    if lease is not None and lease.is_active and lease.expires_at is not None and renews(action, lease.current_role):
        renewed_until = occurred_at + timedelta(days=lease.repository.default_lease_duration_days)
        lease.expires_at = max(lease.expires_at, renewed_until)
    await session.flush()
    return event


async def list_lease_overviews(session: AsyncSession, now: datetime, *,
                               mode: EnforcementMode | None = None) -> list[LeaseOverview]:
    """Every lease (admin and revoked included), ordered by id; `mode=None` means the current enforcement mode."""
    leases = (await session.scalars(select(Lease).order_by(Lease.id))).all()
    return await build_lease_overviews(session, leases, now, mode=mode)


async def get_lease_overview(session: AsyncSession, lease_id: int, now: datetime, *,
                             mode: EnforcementMode | None = None) -> LeaseOverview:
    (overview,) = await build_lease_overviews(session, [await get_lease(session, lease_id)], now, mode=mode)
    return overview


async def get_lease(session: AsyncSession, lease_id: int) -> Lease:
    lease = await session.get(Lease, lease_id)
    if lease is None:
        raise ServiceError(404, f"Lease {lease_id} not found")
    return lease


async def build_lease_overviews(session: AsyncSession, leases: Sequence[Lease], now: datetime, *,
                                mode: EnforcementMode | None = None) -> list[LeaseOverview]:
    advise = (mode or enforcement_state.mode) is not EnforcementMode.DISABLED
    activity = await _renewing_activity(session, {lease.user_id for lease in leases}, now)
    return [_overview(lease, activity.get((lease.user_id, lease.repo_id), []), now, advise) for lease in leases]


async def _renewing_activity(session: AsyncSession, user_ids: set[int], now: datetime) -> ActivityByLease:
    rows = (await session.execute(
        select(ActivityEvent.user_id, ActivityEvent.repo_id, ActivityEvent.action_type, ActivityEvent.timestamp)
        .where(ActivityEvent.user_id.in_(user_ids), ActivityEvent.action_type.in_(RENEWING_ACTIONS),
               ActivityEvent.timestamp <= now))).all()
    grouped: ActivityByLease = defaultdict(list)
    for user_id, repo_id, action, at in rows:
        grouped[(user_id, repo_id)].append(Activity(action, at))
    return grouped


def _overview(lease: Lease, activity: list[Activity], now: datetime, advise: bool) -> LeaseOverview:
    status = lease_status(lease.current_role, lease.expires_at, lease.is_active, now)
    window_start = now - timedelta(days=lease.repository.default_lease_duration_days)
    newest = newest_activity(activity, since=window_start, until=now)
    latest = newest_activity(activity, since=None, until=now)
    return LeaseOverview(
        **LeaseRead.model_validate(lease).model_dump(),
        status=status,
        days_remaining=lease_days_remaining(status, lease.expires_at, now),
        last_activity_at=latest.at if latest else None,
        recommendation=(recommend(status, lease.current_role, newest.action if newest else None)
                        if advise else Recommendation.KEEP),
    )
