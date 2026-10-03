"""Demo refresh (POST /api/v1/demo/refresh): pretends the governor polled the provider once more.

The first refresh finds one person the seed does not know. Every later refresh records random GitHub
activity for people holding a live, expiring lease - through `record_activity`, so it renews leases
exactly like real activity. Somebody always stays idle: the demo personas never act (their scripted
leases must keep lapsing) and `pick_actors` never takes every candidate.
"""

import random
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.seed_data import REFRESH_IDLE_LOGINS, REFRESH_USER
from app.domain.enums import ActionType, Provider, Role
from app.domain.roles import is_at_least, required_permission_for
from app.models import ActivityEvent, Lease, Repository, User
from app.schemas.activity import ActivityEventRead
from app.schemas.people import UserRead
from app.schemas.simulation import DemoRefreshResult
from app.services.baseline_service import team_by_slug
from app.services.lease_service import record_activity

GITHUB_ACTIONS: tuple[ActionType, ...] = (ActionType.PUSH, ActionType.PR_REVIEW, ActionType.ISSUE_COMMENT)


async def refresh_demo(session: AsyncSession, *, now: datetime, rng: random.Random) -> DemoRefreshResult:
    login, name, team_slug = REFRESH_USER
    if await session.scalar(select(User.id).where(User.login == login)) is None:
        user = User(login=login, name=name, team=await team_by_slug(session, team_slug), is_admin=False)
        session.add(user)
        await session.flush()
        return DemoRefreshResult(added_users=[UserRead.model_validate(user)], events=[])
    events = await _record_random_activity(session, now, rng)
    return DemoRefreshResult(added_users=[], events=[ActivityEventRead.model_validate(event) for event in events])


def pick_actors(candidates: Sequence[int], rng: random.Random) -> list[int]:
    """A random part of the candidates; at least one of them always stays idle."""
    if len(candidates) < 2:
        return []
    return rng.sample(candidates, rng.randint(1, len(candidates) - 1))


async def _record_random_activity(session: AsyncSession, now: datetime, rng: random.Random) -> list[ActivityEvent]:
    """One action per chosen person, in a repository they can reach and at a level their role allows."""
    leases = (await session.scalars(
        select(Lease).join(Lease.user).join(Lease.repository)
        .where(Lease.is_active.is_(True), Lease.current_role != Role.ADMIN,
               Repository.provider == Provider.GITHUB, User.login.not_in(REFRESH_IDLE_LOGINS))
        .order_by(Lease.id))).all()
    by_user: dict[int, list[Lease]] = defaultdict(list)
    for lease in leases:
        by_user[lease.user_id].append(lease)
    events: list[ActivityEvent] = []
    for user_id in pick_actors(sorted(by_user), rng):
        lease = rng.choice(by_user[user_id])
        action = rng.choice([a for a in GITHUB_ACTIONS if is_at_least(lease.current_role, required_permission_for(a))])
        events.append(await record_activity(session, user_id=user_id, repo_id=lease.repo_id, action=action,
                                            occurred_at=now))
    return events
