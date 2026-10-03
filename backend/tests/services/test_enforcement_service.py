from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enforcement_mode import EnforcementState
from app.domain.enums import ActionType, ActorType, AuditAction, EnforcementMode, Recommendation, Role
from app.models import AuditLog, Lease
from app.services.enforcement_service import AutoRunResult, change_mode, run_auto_enforcement
from app.services.lease_service import get_lease_overview
from tests.factories import make_event, make_lease, make_repo, make_user
from tests.fakes import RecordingVCS

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
DAY = timedelta(days=1)


async def world(session: AsyncSession) -> dict[str, Lease]:
    """reviewer: EXPIRED write with reviews (DOWNSCOPE); idle: EXPIRED write, nothing (REVOKE);
    warning: WARNING write, nothing (REVOKE but not expired yet); admin: permanent."""
    kamil, marta = await make_user(session, "kamil"), await make_user(session, "marta", team="qa")
    owner = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    core, docs, qa = (await make_repo(session, "core-api"), await make_repo(session, "docs"),
                      await make_repo(session, "qa-automation"))
    leases = {
        "reviewer": await make_lease(session, kamil, core, Role.WRITE, granted_at=NOW - 90 * DAY,
                                     expires_at=NOW - DAY),
        "idle": await make_lease(session, kamil, docs, Role.WRITE, granted_at=NOW - 90 * DAY, expires_at=NOW - DAY),
        "warning": await make_lease(session, marta, qa, Role.READ, granted_at=NOW - 90 * DAY,
                                    expires_at=NOW + 3 * DAY),
        "admin": await make_lease(session, owner, core, Role.ADMIN, granted_at=NOW - 90 * DAY, expires_at=None),
    }
    await make_event(session, kamil, core, ActionType.PR_REVIEW, NOW - 2 * DAY)
    return leases


async def test_disabled_mode_gives_no_recommendations(session: AsyncSession) -> None:
    leases = await world(session)
    warned = await get_lease_overview(session, leases["idle"].id, NOW, mode=EnforcementMode.WARNING)
    silent = await get_lease_overview(session, leases["idle"].id, NOW, mode=EnforcementMode.DISABLED)
    assert (warned.recommendation, silent.recommendation) == (Recommendation.REVOKE, Recommendation.KEEP)
    assert warned.status == silent.status


async def test_auto_run_applies_expired_recommendations_as_system(session: AsyncSession) -> None:
    leases = await world(session)
    vcs = RecordingVCS()

    result = await run_auto_enforcement(session, vcs, now=NOW)

    assert result == AutoRunResult(downscoped=1, revoked=1, blocked=0)
    assert (leases["reviewer"].current_role, leases["reviewer"].is_active) == (Role.READ, True)
    assert leases["idle"].is_active is False
    assert leases["warning"].is_active and leases["admin"].is_active
    actors = {entry.actor_type for entry in (await session.scalars(select(AuditLog))).all()}
    assert actors == {ActorType.SYSTEM}


async def test_second_auto_run_changes_nothing(session: AsyncSession) -> None:
    await world(session)
    await run_auto_enforcement(session, RecordingVCS(), now=NOW)
    assert await run_auto_enforcement(session, RecordingVCS(), now=NOW) == AutoRunResult(0, 0, 0)


async def test_last_admin_block_is_audited_and_the_run_goes_on(session: AsyncSession) -> None:
    leases = await world(session)

    result = await run_auto_enforcement(session, RecordingVCS(blocked={"kamil"}), now=NOW)

    assert result == AutoRunResult(downscoped=1, revoked=0, blocked=1)
    assert leases["idle"].is_active is True
    actions = [e.action for e in (await session.scalars(select(AuditLog))).all()]
    assert AuditAction.LAST_ADMIN_BLOCKED.value in actions


async def test_switching_to_auto_is_audited_and_runs_at_once(session: AsyncSession) -> None:
    leases = await world(session)
    state = EnforcementState()

    result = await change_mode(session, RecordingVCS(), state, mode=EnforcementMode.AUTO, now=NOW, actor_id=7)

    assert state.mode is EnforcementMode.AUTO
    assert result == AutoRunResult(downscoped=1, revoked=1, blocked=0)
    assert leases["idle"].is_active is False
    first = (await session.scalars(select(AuditLog).order_by(AuditLog.id))).first()
    assert first is not None
    assert (first.action, first.actor_id, first.details) == (
        AuditAction.ENFORCEMENT_MODE_CHANGED.value, 7, {"from": "warning", "to": "auto"})


async def test_switching_to_disabled_runs_nothing(session: AsyncSession) -> None:
    leases = await world(session)
    state = EnforcementState()

    result = await change_mode(session, RecordingVCS(), state, mode=EnforcementMode.DISABLED, now=NOW, actor_id=7)

    assert (state.mode, result) == (EnforcementMode.DISABLED, None)
    assert leases["idle"].is_active is True
    state.reset()
    assert state.mode is EnforcementMode.WARNING
