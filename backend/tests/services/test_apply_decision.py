from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import AppealStatus, AuditAction, DecisionAction, Role
from app.models import Appeal, AuditLog, Lease
from app.schemas.decision import DecisionRequest, Extension
from app.services.decision_service import apply_lease_decision, decide_lease
from app.services.errors import ServiceError
from tests.factories import make_lease, make_repo, make_user
from tests.fakes import RecordingVCS

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
DAY = timedelta(days=1)


def extend(**option: object) -> DecisionRequest:
    return DecisionRequest(action=DecisionAction.EXTEND, extension=Extension(**option))


async def lease_of(session: AsyncSession, role: Role = Role.READ, *, expires_in: timedelta = 3 * DAY,
                   is_active: bool = True) -> Lease:
    user = await make_user(session, "marta", team="qa")
    repo = await make_repo(session, "qa-automation")
    expires = None if role is Role.ADMIN else NOW + expires_in
    return await make_lease(session, user, repo, role, granted_at=NOW - 27 * DAY, expires_at=expires,
                            is_active=is_active)


async def test_extend_adds_days_to_the_current_end_and_is_audited(session: AsyncSession) -> None:
    lease = await lease_of(session)
    vcs = RecordingVCS()

    await apply_lease_decision(session, vcs, lease=lease, decision=extend(preset_days=14), now=NOW, actor_id=7)

    assert (lease.expires_at, lease.granted_at, vcs.calls) == (NOW + 17 * DAY, NOW - 27 * DAY, [])
    entry = await session.scalar(select(AuditLog))
    assert entry is not None
    assert (entry.action, entry.details["extension"], entry.justification) == (
        AuditAction.LEASE_EXTENDED.value, {"preset_days": 14}, None)


async def test_extend_restores_a_revoked_lease_through_the_port(session: AsyncSession) -> None:
    lease = await lease_of(session, expires_in=-10 * DAY, is_active=False)
    vcs = RecordingVCS()

    await apply_lease_decision(session, vcs, lease=lease, decision=extend(custom_days=10), now=NOW, actor_id=7)

    assert vcs.calls == [("longtails/qa-automation", "marta", "read")]
    assert (lease.is_active, lease.granted_at, lease.expires_at) == (True, NOW, NOW + 10 * DAY)


async def test_admin_lease_cannot_be_extended(session: AsyncSession) -> None:
    lease = await lease_of(session, Role.ADMIN)
    with pytest.raises(ServiceError) as refused:
        await apply_lease_decision(session, RecordingVCS(), lease=lease, decision=extend(preset_days=7), now=NOW,
                                   actor_id=7)
    assert refused.value.status_code == 422


async def test_until_date_must_be_after_the_current_end(session: AsyncSession) -> None:
    lease = await lease_of(session, expires_in=30 * DAY)
    with pytest.raises(ServiceError) as refused:
        await apply_lease_decision(session, RecordingVCS(), lease=lease, decision=extend(until_date=date(2026, 10, 10)),
                                   now=NOW, actor_id=7)
    assert refused.value.status_code == 422
    assert lease.expires_at == NOW + 30 * DAY


async def test_downscope_and_revoke_are_dispatched(session: AsyncSession) -> None:
    lease = await lease_of(session, Role.WRITE)
    vcs = RecordingVCS()
    why = "Brak pushy w oknie dostępu"
    await apply_lease_decision(session, vcs, lease=lease, now=NOW, actor_id=7,
                               decision=DecisionRequest(action=DecisionAction.DOWNSCOPE, justification=why))
    await apply_lease_decision(session, vcs, lease=lease, now=NOW, actor_id=7,
                               decision=DecisionRequest(action=DecisionAction.REVOKE, justification=why))
    assert (lease.current_role, lease.is_active) == (Role.READ, False)
    assert vcs.removed == [("longtails/qa-automation", "marta")]


async def test_decide_lease_refuses_a_lease_with_a_pending_appeal(session: AsyncSession) -> None:
    lease = await lease_of(session)
    session.add(Appeal(lease=lease, user_id=lease.user_id, repo_id=lease.repo_id, requested_role=Role.READ,
                       justification="Release v2.1", status=AppealStatus.PENDING, created_at=NOW))
    await session.flush()

    with pytest.raises(ServiceError) as refused:
        await decide_lease(session, RecordingVCS(), lease_id=lease.id, decision=extend(preset_days=7), now=NOW,
                           actor_id=7)
    assert refused.value.status_code == 409
    assert lease.expires_at == NOW + 3 * DAY


async def test_decide_lease_on_unknown_lease_is_404(session: AsyncSession) -> None:
    with pytest.raises(ServiceError) as missing:
        await decide_lease(session, RecordingVCS(), lease_id=404, decision=extend(preset_days=7), now=NOW, actor_id=7)
    assert missing.value.status_code == 404
