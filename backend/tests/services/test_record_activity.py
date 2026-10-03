from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_provider import TimeProvider
from app.db.activity_extras import seed_activity_extras
from app.db.seed import seed_demo_data
from app.domain.enums import ActionType, Role
from app.domain.lease_rules import renews
from app.models import ActivityEvent, Lease
from app.services.lease_service import record_activity
from tests.factories import make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
DAY = timedelta(days=1)


async def lease_with(session: AsyncSession, role: Role, *, expires_in: timedelta = 2 * DAY,
                     is_active: bool = True) -> Lease:
    user = await make_user(session, "kamil")
    repo = await make_repo(session, "core-api")
    expires = None if role is Role.ADMIN else NOW + expires_in
    return await make_lease(session, user, repo, role, granted_at=NOW - 60 * DAY, expires_at=expires,
                            is_active=is_active)


async def record(session: AsyncSession, lease: Lease, action: ActionType) -> ActivityEvent:
    return await record_activity(session, user_id=lease.user_id, repo_id=lease.repo_id, action=action,
                                 occurred_at=NOW)


async def test_event_is_stored_with_its_required_permission(session: AsyncSession) -> None:
    lease = await lease_with(session, Role.WRITE)
    event = await record(session, lease, ActionType.PR_REVIEW)
    stored = await session.get(ActivityEvent, event.id)
    assert stored is not None
    assert (stored.action_type, stored.required_permission, stored.timestamp) == (
        ActionType.PR_REVIEW, Role.READ, NOW)


async def test_push_renews_write_lease_for_lease_days(session: AsyncSession) -> None:
    lease = await lease_with(session, Role.WRITE)
    await record(session, lease, ActionType.PUSH)
    assert lease.expires_at == NOW + 30 * DAY


async def test_review_does_not_renew_write_lease(session: AsyncSession) -> None:
    lease = await lease_with(session, Role.WRITE)
    await record(session, lease, ActionType.PR_REVIEW)
    assert lease.expires_at == NOW + 2 * DAY


async def test_comment_renews_read_lease(session: AsyncSession) -> None:
    lease = await lease_with(session, Role.READ)
    await record(session, lease, ActionType.ISSUE_COMMENT)
    assert lease.expires_at == NOW + 30 * DAY


async def test_renewal_never_shortens_an_admin_extension(session: AsyncSession) -> None:
    lease = await lease_with(session, Role.WRITE, expires_in=90 * DAY)
    await record(session, lease, ActionType.PUSH)
    assert lease.expires_at == NOW + 90 * DAY


async def test_mock_only_merge_does_not_renew(session: AsyncSession) -> None:
    lease = await lease_with(session, Role.WRITE)
    await record(session, lease, ActionType.PR_MERGE)
    assert lease.expires_at == NOW + 2 * DAY


async def test_revoked_and_admin_leases_are_left_alone(session: AsyncSession) -> None:
    revoked = await lease_with(session, Role.WRITE, is_active=False)
    await record(session, revoked, ActionType.PUSH)
    assert revoked.expires_at == NOW + 2 * DAY
    admin_user = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    admin = await make_lease(session, admin_user, await make_repo(session, "infra"), Role.ADMIN,
                             granted_at=NOW, expires_at=None)
    await record(session, admin, ActionType.PUSH)
    assert admin.expires_at is None


async def test_seed_expiry_follows_the_renewal_matrix(session: AsyncSession) -> None:
    clock = TimeProvider(base_time_source=lambda: NOW)
    await seed_demo_data(session, clock)
    await seed_activity_extras(session, clock)  # merges and labels must not count
    leases = (await session.scalars(select(Lease).where(Lease.current_role != Role.ADMIN))).all()
    events = (await session.scalars(select(ActivityEvent))).all()
    assert leases
    for lease in leases:
        mine = [e for e in events if (e.user_id, e.repo_id) == (lease.user_id, lease.repo_id)]
        renewing = [e.timestamp for e in mine if renews(e.action_type, lease.current_role)]
        expected = max([lease.granted_at, *renewing]) + 30 * DAY
        assert lease.expires_at == expected, (lease.user.login, lease.repository.name)
