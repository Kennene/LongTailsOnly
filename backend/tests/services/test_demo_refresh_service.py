import random
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_provider import TimeProvider
from app.db.seed import seed_demo_data
from app.db.seed_data import REFRESH_IDLE_LOGINS, REFRESH_USER
from app.domain.enums import ActionType, Provider, Role
from app.domain.lease_rules import renews
from app.domain.roles import is_at_least
from app.models import ActivityEvent, Lease, Repository, User
from app.schemas import DemoRefreshResult
from app.services.demo_refresh_service import pick_actors, refresh_demo

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
SEEDS = range(25)


@pytest.fixture
async def seeded(session: AsyncSession) -> AsyncSession:
    await seed_demo_data(session, TimeProvider(base_time_source=lambda: NOW))
    return session


async def refresh(session: AsyncSession, seed: int = 0, *, now: datetime = NOW) -> DemoRefreshResult:
    return await refresh_demo(session, now=now, rng=random.Random(seed))


async def activity_after_first_refresh(session: AsyncSession, seed: int) -> DemoRefreshResult:
    await refresh(session)  # the first refresh only brings the new person in
    return await refresh(session, seed)


async def people_who_can_act(session: AsyncSession) -> set[int]:
    """Everyone with a live, expiring GitHub lease, minus the demo personas that never act."""
    rows = await session.scalars(
        select(Lease.user_id).join(User, User.id == Lease.user_id).join(Repository, Repository.id == Lease.repo_id)
        .where(Lease.is_active.is_(True), Lease.current_role != Role.ADMIN,
               Repository.provider == Provider.GITHUB, User.login.not_in(REFRESH_IDLE_LOGINS)))
    return set(rows)


async def test_first_refresh_adds_the_new_person_without_any_access(seeded: AsyncSession) -> None:
    login, name, team_slug = REFRESH_USER
    events_before = len((await seeded.scalars(select(ActivityEvent.id))).all())

    result = await refresh(seeded)

    assert [(user.login, user.name, user.is_admin) for user in result.added_users] == [(login, name, False)]
    assert result.added_users[0].team is not None and result.added_users[0].team.slug == team_slug
    assert result.events == []
    stored = await seeded.scalar(select(User).where(User.login == login))
    assert stored is not None
    assert (await seeded.scalars(select(Lease.id).where(Lease.user_id == stored.id))).all() == []
    assert len((await seeded.scalars(select(ActivityEvent.id))).all()) == events_before


async def test_later_refreshes_record_activity_and_add_nobody(seeded: AsyncSession) -> None:
    await refresh(seeded)
    for seed in range(3):
        result = await refresh(seeded, seed)
        assert result.added_users == []
        assert result.events
    assert len((await seeded.scalars(select(User.id))).all()) == 20


@pytest.mark.parametrize("seed", SEEDS)
async def test_demo_personas_never_act(seeded: AsyncSession, seed: int) -> None:
    result = await activity_after_first_refresh(seeded, seed)
    idle_ids = set(await seeded.scalars(select(User.id).where(User.login.in_(REFRESH_IDLE_LOGINS))))
    assert len(idle_ids) == len(REFRESH_IDLE_LOGINS)
    assert idle_ids.isdisjoint(event.user_id for event in result.events)


@pytest.mark.parametrize("seed", SEEDS)
async def test_someone_with_access_always_stays_idle(seeded: AsyncSession, seed: int) -> None:
    candidates = await people_who_can_act(seeded)
    result = await activity_after_first_refresh(seeded, seed)
    actors = {event.user_id for event in result.events}
    assert actors <= candidates
    assert 1 <= len(actors) < len(candidates)
    assert len(result.events) == len(actors), "one action per person per refresh"


@pytest.mark.parametrize("seed", SEEDS)
async def test_actions_happen_now_in_github_within_the_persons_role(seeded: AsyncSession, seed: int) -> None:
    result = await activity_after_first_refresh(seeded, seed)
    for event in result.events:
        lease = await seeded.scalar(
            select(Lease).where(Lease.user_id == event.user_id, Lease.repo_id == event.repo_id))
        assert lease is not None and lease.is_active
        assert lease.repository.provider is Provider.GITHUB
        assert event.action_type in {ActionType.PUSH, ActionType.PR_REVIEW, ActionType.ISSUE_COMMENT}
        assert is_at_least(lease.current_role, event.required_permission)
        assert event.timestamp == NOW


async def test_activity_renews_leases_like_real_activity(seeded: AsyncSession) -> None:
    await refresh(seeded)
    later = NOW + timedelta(days=20)
    renewed = 0
    for seed in SEEDS:
        for event in (await refresh(seeded, seed, now=later)).events:
            lease = await seeded.scalar(
                select(Lease).where(Lease.user_id == event.user_id, Lease.repo_id == event.repo_id))
            assert lease is not None and lease.expires_at is not None
            if renews(event.action_type, lease.current_role):
                renewed += 1
                assert lease.expires_at == later + timedelta(days=30)
    assert renewed > 0


async def test_activity_refresh_without_the_seed_does_nothing(session: AsyncSession) -> None:
    session.add(User(login=REFRESH_USER[0], name=REFRESH_USER[1], is_admin=False))
    await session.flush()
    result = await refresh(session)
    assert result.added_users == [] and result.events == []


@pytest.mark.parametrize("seed", SEEDS)
def test_pick_actors_never_takes_everyone(seed: int) -> None:
    candidates = [3, 5, 8, 13, 21]
    actors = pick_actors(candidates, random.Random(seed))
    assert 1 <= len(actors) < len(candidates)
    assert set(actors) <= set(candidates) and len(set(actors)) == len(actors)


@pytest.mark.parametrize("candidates", [[], [7]])
def test_pick_actors_keeps_a_lone_person_idle(candidates: list[int]) -> None:
    assert pick_actors(candidates, random.Random(0)) == []
