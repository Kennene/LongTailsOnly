"""Lease engine service (docs/3-silnik-dzierzawy/DOCUMENTATION.md §3): activity, statuses and recommendations."""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType
from app.domain.lease_rules import renews
from app.domain.roles import required_permission_for
from app.models import ActivityEvent, Lease


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
