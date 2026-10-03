from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType, ActorType, AppealStatus, Role
from app.models import AuditLog, Lease
from app.services.appeal_service import build_appeal_overviews, reject_appeal, submit_appeal
from app.services.errors import ServiceError
from tests.factories import make_event, make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def marta_leases(session: AsyncSession) -> tuple[Lease, Lease]:
    marta = await make_user(session, "marta", team="qa")
    qa = await make_repo(session, "qa-automation")
    frontend = await make_repo(session, "frontend-app")
    warning = await make_lease(session, marta, qa, Role.READ, granted_at=NOW - timedelta(days=27),
                               expires_at=NOW + timedelta(days=3))
    expired = await make_lease(session, marta, frontend, Role.READ, granted_at=NOW - timedelta(days=40),
                               expires_at=NOW - timedelta(days=10))
    return warning, expired


async def status_of(call: object) -> int:
    with pytest.raises(ServiceError) as error:
        await call  # type: ignore[misc]
    return error.value.status_code


async def test_submit_creates_pending_appeal_and_audits(session: AsyncSession) -> None:
    warning, _ = await marta_leases(session)

    appeal = await submit_appeal(session, lease_id=warning.id, justification="  Release v2.1 next week ", now=NOW)

    assert (appeal.status, appeal.requested_role, appeal.created_at) == (AppealStatus.PENDING, Role.READ, NOW)
    assert (appeal.user_id, appeal.repo_id, appeal.justification) == (
        warning.user_id, warning.repo_id, "Release v2.1 next week")
    entry = await session.scalar(select(AuditLog))
    assert entry is not None
    assert (entry.actor_type, entry.actor_id, entry.action, entry.target, entry.justification) == (
        ActorType.USER, warning.user_id, "APPEAL_SUBMITTED", "longtails/qa-automation:marta",
        "Release v2.1 next week")


async def test_blank_justification_is_rejected(session: AsyncSession) -> None:
    warning, _ = await marta_leases(session)

    assert await status_of(submit_appeal(session, lease_id=warning.id, justification=" \n\t ", now=NOW)) == 422


async def test_justification_must_be_new_across_leases(session: AsyncSession) -> None:
    warning, expired = await marta_leases(session)
    await submit_appeal(session, lease_id=warning.id, justification="Release v2.1", now=NOW)

    repeated = submit_appeal(session, lease_id=expired.id, justification="  release   V2.1 ", now=NOW)

    assert await status_of(repeated) == 422
    fresh = await submit_appeal(session, lease_id=expired.id, justification="Regression tests for v2.1", now=NOW)
    assert fresh.status is AppealStatus.PENDING


async def test_active_and_admin_leases_cannot_be_appealed(session: AsyncSession) -> None:
    anna = await make_user(session, "ania")
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    repo = await make_repo(session, "core-api")
    active = await make_lease(session, anna, repo, Role.WRITE, granted_at=NOW, expires_at=NOW + timedelta(days=20))
    permanent = await make_lease(session, admin, repo, Role.ADMIN, granted_at=NOW, expires_at=None)

    assert await status_of(submit_appeal(session, lease_id=active.id, justification="Just in case", now=NOW)) == 409
    assert await status_of(submit_appeal(session, lease_id=permanent.id, justification="Need it", now=NOW)) == 409


async def test_only_one_pending_appeal_per_lease(session: AsyncSession) -> None:
    warning, _ = await marta_leases(session)
    await submit_appeal(session, lease_id=warning.id, justification="Release", now=NOW)

    assert await status_of(submit_appeal(session, lease_id=warning.id, justification="Another", now=NOW)) == 409


async def test_unknown_lease_is_404(session: AsyncSession) -> None:
    assert await status_of(submit_appeal(session, lease_id=999, justification="x", now=NOW)) == 404


async def test_overviews_carry_ready_numbers(session: AsyncSession) -> None:
    warning, expired = await marta_leases(session)
    await make_event(session, warning.user, warning.repository, ActionType.ISSUE_COMMENT, NOW - timedelta(days=27))
    await make_event(session, warning.user, warning.repository, ActionType.ISSUE_COMMENT, NOW - timedelta(days=40))
    first = await submit_appeal(session, lease_id=warning.id, justification="Release", now=NOW)
    second = await submit_appeal(session, lease_id=expired.id, justification="Regression", now=NOW)

    views = {view.id: view for view in await build_appeal_overviews(session, [second, first], NOW)}

    assert (views[first.id].previous_appeals, views[second.id].previous_appeals) == (0, 1)
    assert (views[first.id].days_remaining, views[second.id].days_remaining) == (3, -10)
    assert (views[first.id].recent_activity_count, views[second.id].recent_activity_count) == (1, 0)
    assert (views[first.id].user.login, views[first.id].repository.name) == ("marta", "qa-automation")
    assert (views[first.id].lease_role, views[first.id].lease_is_active) == (Role.READ, True)


async def test_reject_closes_appeal_and_leaves_lease_untouched(session: AsyncSession) -> None:
    warning, _ = await marta_leases(session)
    appeal = await submit_appeal(session, lease_id=warning.id, justification="Release", now=NOW)

    rejected = await reject_appeal(session, appeal_id=appeal.id, now=NOW, actor_id=99,
                                   justification="No business need")

    assert (rejected.status, rejected.resolved_at) == (AppealStatus.REJECTED, NOW)
    assert warning.expires_at == NOW + timedelta(days=3)
    entry = await session.scalar(select(AuditLog).where(AuditLog.action == "APPEAL_REJECTED"))
    assert entry is not None
    assert (entry.actor_type, entry.actor_id, entry.justification) == (ActorType.ADMIN, 99, "No business need")


async def test_resolved_or_unknown_appeal_cannot_be_rejected(session: AsyncSession) -> None:
    warning, _ = await marta_leases(session)
    appeal = await submit_appeal(session, lease_id=warning.id, justification="Release", now=NOW)
    await reject_appeal(session, appeal_id=appeal.id, now=NOW, actor_id=99, justification="No")

    again = reject_appeal(session, appeal_id=appeal.id, now=NOW, actor_id=99, justification="Still no")
    missing = reject_appeal(session, appeal_id=999, now=NOW, actor_id=99, justification="No")

    assert (await status_of(again), await status_of(missing)) == (409, 404)
