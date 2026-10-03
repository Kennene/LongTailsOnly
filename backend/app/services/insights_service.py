"""Ready-made dashboard and graph data (ADR 0014 §5.9-5.10); statuses come from Person 3's lease engine."""

from dataclasses import asdict
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import AppealStatus
from app.domain.insights import LeaseSnapshot, MemberSnapshot, build_graph_layout, compute_dashboard_counters
from app.domain.lease_window import EXPIRED_WINDOW_DAYS
from app.models import Appeal, Repository, User
from app.schemas.insights import DashboardStats, PermissionGraph
from app.schemas.lease import LeaseOverview
from app.services.baseline_service import team_by_slug
from app.services.lease_service import list_lease_overviews


def _snapshot(view: LeaseOverview) -> LeaseSnapshot:
    return LeaseSnapshot(view.id, view.user.login, view.repository.name, view.current_role, view.days_remaining,
                         view.is_active, view.status if view.is_active else None,
                         view.recommendation if view.is_active else None)


async def _leases(session: AsyncSession, now: datetime) -> list[LeaseSnapshot]:
    return [_snapshot(view) for view in await list_lease_overviews(session, now)]


async def _members(session: AsyncSession) -> list[MemberSnapshot]:
    users = (await session.scalars(select(User).order_by(User.id))).all()
    return [MemberSnapshot(user.login, user.team.slug if user.team else None, user.team.name if user.team else None,
                           user.is_admin) for user in users]


async def get_dashboard_stats(session: AsyncSession, *, now: datetime) -> DashboardStats:
    pending = await session.scalar(
        select(func.count()).select_from(Appeal).where(Appeal.status == AppealStatus.PENDING))
    counters = compute_dashboard_counters(await _leases(session, now), await _members(session), int(pending or 0))
    return DashboardStats(generated_at=now, expired_window_days=EXPIRED_WINDOW_DAYS, **asdict(counters))


async def get_permission_graph(session: AsyncSession, *, now: datetime, team: str | None = None) -> PermissionGraph:
    if team is not None:
        await team_by_slug(session, team)
    repos = (await session.scalars(select(Repository.name))).all()
    layout = build_graph_layout(await _members(session), repos, await _leases(session, now), team)
    return PermissionGraph.from_layout(layout)
