from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActorType, AuditAction, Role
from app.models import AuditLog, Lease
from app.services.decision_service import downscope_lease, revoke_lease
from app.services.errors import LastAdminError, ServiceError
from tests.factories import make_lease, make_repo, make_user
from tests.fakes import RecordingVCS

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
DAY = timedelta(days=1)
WHY = "Brak pushy od 30 dni; nadal recenzuje kod."


async def lease_of(session: AsyncSession, role: Role = Role.WRITE, *, is_active: bool = True) -> Lease:
    user = await make_user(session, "kamil")
    repo = await make_repo(session, "core-api")
    expires = None if role is Role.ADMIN else NOW - DAY
    return await make_lease(session, user, repo, role, granted_at=NOW - 90 * DAY, expires_at=expires,
                            is_active=is_active)


async def audit(session: AsyncSession) -> list[AuditLog]:
    return list((await session.scalars(select(AuditLog).order_by(AuditLog.id))).all())


async def test_downscope_goes_through_the_port_and_starts_a_read_lease(session: AsyncSession) -> None:
    lease = await lease_of(session)
    vcs = RecordingVCS()

    await downscope_lease(session, vcs, lease=lease, now=NOW, actor_id=7, justification=WHY)

    assert vcs.calls == [("longtails/core-api", "kamil", "read")]
    assert (lease.current_role, lease.granted_at, lease.expires_at, lease.is_active) == (
        Role.READ, NOW, NOW + 30 * DAY, True)
    (entry,) = await audit(session)
    assert (entry.action, entry.actor_type, entry.actor_id, entry.target, entry.justification) == (
        AuditAction.LEASE_DOWNSCOPED.value, ActorType.ADMIN, 7, "longtails/core-api:kamil", WHY)
    assert (entry.details["role_before"], entry.details["role_after"]) == ("write", "read")


@pytest.mark.parametrize(("role", "is_active"), [(Role.READ, True), (Role.ADMIN, True), (Role.WRITE, False)])
async def test_downscope_only_from_an_active_write_lease(session: AsyncSession, role: Role, is_active: bool) -> None:
    lease = await lease_of(session, role, is_active=is_active)
    with pytest.raises(ServiceError) as refused:
        await downscope_lease(session, RecordingVCS(), lease=lease, now=NOW, actor_id=7, justification=WHY)
    assert refused.value.status_code == 422


@pytest.mark.parametrize("decide", [downscope_lease, revoke_lease])
@pytest.mark.parametrize("justification", [None, "   "])
async def test_downscope_and_revoke_need_a_justification(session: AsyncSession, decide, justification) -> None:
    lease = await lease_of(session)
    with pytest.raises(ServiceError) as refused:
        await decide(session, RecordingVCS(), lease=lease, now=NOW, actor_id=7, justification=justification)
    assert refused.value.status_code == 422
    assert lease.is_active and lease.current_role is Role.WRITE


async def test_revoke_removes_the_collaborator(session: AsyncSession) -> None:
    lease = await lease_of(session)
    vcs = RecordingVCS()

    await revoke_lease(session, vcs, lease=lease, now=NOW, actor_id=None, justification=WHY)

    assert vcs.removed == [("longtails/core-api", "kamil")]
    assert lease.is_active is False
    (entry,) = await audit(session)
    assert (entry.action, entry.actor_type, entry.actor_id) == (AuditAction.LEASE_REVOKED.value, ActorType.SYSTEM, None)


async def test_revoking_a_revoked_lease_is_a_conflict(session: AsyncSession) -> None:
    lease = await lease_of(session, is_active=False)
    with pytest.raises(ServiceError) as refused:
        await revoke_lease(session, RecordingVCS(), lease=lease, now=NOW, actor_id=7, justification=WHY)
    assert refused.value.status_code == 409


async def test_blocked_revoke_is_audited_and_changes_nothing(session: AsyncSession) -> None:
    lease = await lease_of(session)

    with pytest.raises(LastAdminError):
        await revoke_lease(session, RecordingVCS(blocked={"kamil"}), lease=lease, now=NOW, actor_id=7,
                           justification=WHY)

    assert lease.is_active is True
    (entry,) = await audit(session)
    assert (entry.action, entry.actor_type, entry.target) == (
        AuditAction.LAST_ADMIN_BLOCKED.value, ActorType.ADMIN, "longtails/core-api:kamil")
