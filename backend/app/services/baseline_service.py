"""Team baseline and onboarding (ADR 0011 §5.1-5.2)."""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.baseline_rules import BASELINE_WINDOW_DAYS, MemberActivity, compute_baseline
from app.domain.enums import ActorType, AuditAction
from app.domain.roles import RENEWING_ACTIONS
from app.models import ActivityEvent, Lease, Repository, Team, User
from app.ports.vcs_provider import VCSProvider
from app.schemas.baseline import BaselineEntry, OnboardingProposal
from app.schemas.people import TeamRead, UserRead
from app.schemas.repository import RepositoryRead
from app.services.audit_service import write_audit_event
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
        ActivityEvent.user_id.in_(member_ids), ActivityEvent.action_type.in_(RENEWING_ACTIONS),
        ActivityEvent.timestamp >= now - timedelta(days=window_days)))
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


async def get_onboarding_proposal(session: AsyncSession, *, login: str, now: datetime) -> OnboardingProposal:
    user, team = await _team_member(session, login)
    entries = await get_team_baseline(session, team, now)
    granted = set(await session.scalars(
        select(Lease.repo_id).where(Lease.user_id == user.id, Lease.is_active.is_(True))))
    return OnboardingProposal(
        user=UserRead.model_validate(user),
        team=TeamRead.model_validate(team),
        to_grant=[entry for entry in entries if entry.repository.id not in granted],
        already_granted=[entry for entry in entries if entry.repository.id in granted],
    )


async def apply_onboarding(
    session: AsyncSession, vcs: VCSProvider, *, login: str, now: datetime, actor_id: int
) -> OnboardingProposal:
    proposal = await get_onboarding_proposal(session, login=login, now=now)
    for entry in proposal.to_grant:
        await vcs.set_permission(entry.repository.owner, entry.repository.name, login, entry.proposed_role)
    if proposal.to_grant:
        await write_audit_event(
            session, now=now, actor_type=ActorType.ADMIN, actor_id=actor_id, action=AuditAction.BASELINE_APPLIED,
            target=f"{proposal.team.slug}:{login}",
            details={"granted": {entry.repository.name: entry.proposed_role.value for entry in proposal.to_grant}},
        )
    return await get_onboarding_proposal(session, login=login, now=now)


async def _team_member(session: AsyncSession, login: str) -> tuple[User, Team]:
    user = await session.scalar(select(User).where(User.login == login))
    if user is None:
        raise ServiceError(404, f"User {login} not found")
    if user.team is None or user.is_admin:
        raise ServiceError(422, f"User {login} does not belong to a team")
    return user, user.team
