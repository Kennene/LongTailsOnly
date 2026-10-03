from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_provider import TimeProvider
from app.db.activity_extras import seed_activity_extras
from app.db.seed import seed_demo_data
from app.domain.enums import ActionType, LeaseStatus, Recommendation, Role
from app.schemas.lease import LeaseOverview
from app.services.errors import ServiceError
from app.services.lease_service import get_lease_overview, list_lease_overviews
from tests.factories import make_event, make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
DAY = timedelta(days=1)


async def test_overview_carries_status_days_activity_and_recommendation(session: AsyncSession) -> None:
    kamil = await make_user(session, "kamil")
    repo = await make_repo(session, "payment-service")
    lease = await make_lease(session, kamil, repo, Role.WRITE, granted_at=NOW - 90 * DAY, expires_at=NOW + 4 * DAY)
    await make_event(session, kamil, repo, ActionType.PUSH, NOW - 26 * DAY)
    await make_event(session, kamil, repo, ActionType.PR_REVIEW, NOW - 2 * DAY)
    await make_event(session, kamil, repo, ActionType.PR_MERGE, NOW - DAY)  # mock-only, never "activity"
    await make_event(session, kamil, repo, ActionType.PUSH, NOW + DAY)  # future after a clock reset

    overview = await get_lease_overview(session, lease.id, NOW)

    assert (overview.status, overview.days_remaining, overview.recommendation) == (
        LeaseStatus.WARNING, 4, Recommendation.DOWNSCOPE)
    assert overview.last_activity_at == NOW - 2 * DAY
    assert (overview.user.login, overview.repository.name) == ("kamil", "payment-service")


async def test_unknown_lease_is_404(session: AsyncSession) -> None:
    with pytest.raises(ServiceError) as missing:
        await get_lease_overview(session, 999, NOW)
    assert missing.value.status_code == 404


async def test_fresh_lease_without_activity_is_kept(session: AsyncSession) -> None:
    user = await make_user(session, "nowy-dev")
    lease = await make_lease(session, user, await make_repo(session, "core-api"), Role.WRITE, granted_at=NOW,
                             expires_at=NOW + 30 * DAY)
    overview = await get_lease_overview(session, lease.id, NOW)
    assert (overview.status, overview.recommendation, overview.last_activity_at) == (
        LeaseStatus.ACTIVE, Recommendation.KEEP, None)


def pick(overviews: list[LeaseOverview], login: str, repo: str) -> tuple:
    view = next(v for v in overviews if (v.user.login, v.repository.name) == (login, repo))
    return view.status, view.days_remaining, view.recommendation


async def seeded(session: AsyncSession) -> TimeProvider:
    clock = TimeProvider(base_time_source=lambda: NOW)
    await seed_demo_data(session, clock)
    await seed_activity_extras(session, clock)
    return clock


async def test_seeded_demo_at_start(session: AsyncSession) -> None:
    clock = await seeded(session)
    views = await list_lease_overviews(session, clock.get_current_time())
    assert [v.id for v in views] == sorted(v.id for v in views)
    assert pick(views, "kamil", "core-api") == (LeaseStatus.ACTIVE, 29, Recommendation.KEEP)
    assert pick(views, "kamil", "payment-service") == (LeaseStatus.WARNING, 5, Recommendation.DOWNSCOPE)
    assert pick(views, "kamil", "frontend-app")[::2] == (LeaseStatus.EXPIRED, Recommendation.DOWNSCOPE)
    assert pick(views, "kamil", "legacy-reports")[::2] == (LeaseStatus.EXPIRED, Recommendation.REVOKE)
    assert pick(views, "marta", "qa-automation") == (LeaseStatus.WARNING, 3, Recommendation.KEEP)
    assert pick(views, "tomasz-admin", "core-api") == (LeaseStatus.PERMANENT, None, Recommendation.KEEP)


async def test_seeded_demo_after_time_travel(session: AsyncSession) -> None:
    clock = await seeded(session)
    clock.advance(15)
    views = await list_lease_overviews(session, clock.get_current_time())
    assert pick(views, "kamil", "core-api")[::2] == (LeaseStatus.ACTIVE, Recommendation.KEEP)
    assert pick(views, "kamil", "payment-service")[::2] == (LeaseStatus.EXPIRED, Recommendation.DOWNSCOPE)
    assert pick(views, "marta", "qa-automation")[::2] == (LeaseStatus.EXPIRED, Recommendation.REVOKE)
    clock.advance(15)
    views = await list_lease_overviews(session, clock.get_current_time())
    assert pick(views, "kamil", "core-api")[::2] == (LeaseStatus.EXPIRED, Recommendation.REVOKE)
    assert pick(views, "kamil", "payment-service")[::2] == (LeaseStatus.EXPIRED, Recommendation.REVOKE)
