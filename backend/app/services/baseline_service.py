"""Team baseline service (ADR 0010 §5.1); onboarding is added in step 4.2."""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.baseline_rules import BASELINE_WINDOW_DAYS, MemberActivity, compute_baseline
from app.models import ActivityEvent, Repository, Team, User
from app.schemas.baseline import BaselineEntry
from app.schemas.repository import RepositoryRead
from app.services.errors import ServiceError


async def team_by_slug(session: AsyncSession, slug: str) -> Team:
    team = await session.scalar(select(Team).where(Team.slug == slug))
    if team is None:
        raise ServiceError(404, f"Team {slug} not found")
    return team


async def get_team_baseline(
    session: AsyncSession, team: Team, now: datetime, window_days: int = BASELINE_WINDOW_DAYS
) -> list[BaselineEntry]:
    member_ids = set(await session.scalars(
        select(User.id).where(User.team_id == team.id, User.is_admin.is_(False))))
    events = await session.scalars(select(ActivityEvent).where(
        ActivityEvent.user_id.in_(member_ids), ActivityEvent.timestamp >= now - timedelta(days=window_days)))
    activity = [MemberActivity(e.user_id, e.repo_id, e.required_permission, e.timestamp) for e in events]
    candidates = compute_baseline(member_ids, activity, now, window_days)
    repos = {repo.id: repo for repo in await session.scalars(
        select(Repository).where(Repository.id.in_([c.repo_id for c in candidates])))}
    entries = [
        BaselineEntry(team_id=team.id, repository=RepositoryRead.model_validate(repos[c.repo_id]),
                      proposed_role=c.proposed_role, active_members=c.active_members, team_size=len(member_ids))
        for c in candidates
    ]
    return sorted(entries, key=lambda entry: entry.repository.name)
