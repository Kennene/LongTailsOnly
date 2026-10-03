"""Generator 2.6: richer, deterministic GitHub activity on top of the demo seed (ADR 0010).

The seed (ADR 0008) owns scenarios A-D and the lease-renewing events. This module only *adds*
mock-only events (merge, label, settings change) derived from the seeded data, so the
/events feed looks like a real repository. None of them can renew a lease.
"""
import random
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.seed import seed_anchor
from app.db.seed_data import ADMIN_LOGIN
from app.domain.enums import ActionType
from app.domain.roles import required_permission_for
from app.models import ActivityEvent, Repository, User
from app.ports.clock import ClockPort

SEED = 20261003
EXTRA_ACTIONS = (ActionType.PR_MERGE, ActionType.ISSUE_LABEL, ActionType.REPO_SETTINGS)
SETTINGS_REPO = "core-api"  # never legacy-reports: scenario C must stay at zero events
SETTINGS_DAYS_AGO = 40
MERGE_PROBABILITY = 0.6
LABEL_PROBABILITY = 0.5


def _make(user_id: int, repo_id: int, when: datetime, action: ActionType) -> ActivityEvent:
    return ActivityEvent(
        user_id=user_id, repo_id=repo_id, timestamp=when, action_type=action,
        required_permission=required_permission_for(action),
    )


async def seed_activity_extras(session: AsyncSession, clock: ClockPort) -> int:
    """Add extra events once; returns how many were created (0 when already present)."""
    already = await session.scalar(
        select(ActivityEvent.id).where(ActivityEvent.action_type.in_(EXTRA_ACTIONS)).limit(1)
    )
    if already is not None:
        return 0
    rng = random.Random(SEED)
    now = clock.get_current_time()
    base = (await session.scalars(select(ActivityEvent).order_by(ActivityEvent.id))).all()
    created: list[ActivityEvent] = []
    for event in base:
        if event.action_type is ActionType.PUSH and rng.random() < MERGE_PROBABILITY:
            when = event.timestamp + timedelta(minutes=rng.randint(30, 240))
            created.append(_make(event.user_id, event.repo_id, when, ActionType.PR_MERGE))
        elif event.action_type is ActionType.ISSUE_COMMENT and rng.random() < LABEL_PROBABILITY:
            when = event.timestamp + timedelta(minutes=rng.randint(10, 120))
            created.append(_make(event.user_id, event.repo_id, when, ActionType.ISSUE_LABEL))
    admin = await session.scalar(select(User).where(User.login == ADMIN_LOGIN))
    repo = await session.scalar(select(Repository).where(Repository.name == SETTINGS_REPO))
    if admin is not None and repo is not None:
        when = seed_anchor(clock) - timedelta(days=SETTINGS_DAYS_AGO) + timedelta(hours=9)
        created.append(_make(admin.id, repo.id, when, ActionType.REPO_SETTINGS))
    created = [e for e in created if e.timestamp <= now]  # the feed never shows the future
    session.add_all(created)
    await session.commit()
    return len(created)
