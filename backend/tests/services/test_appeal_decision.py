from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.appeal_service as appeal_service
from app.domain.enums import AppealStatus, DecisionAction, Role
from app.models import Appeal, Lease
from app.schemas.decision import DecisionRequest, Extension
from app.services.appeal_service import decide_appeal, submit_appeal
from app.services.errors import ServiceError
from tests.factories import make_lease, make_repo, make_user
from tests.fakes import RecordingVCS

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


@pytest.fixture
def decisions(monkeypatch: pytest.MonkeyPatch) -> list[tuple[int, DecisionAction, int]]:
    calls: list[tuple[int, DecisionAction, int]] = []

    async def record(_session: object, _vcs: object, *, lease: Lease, decision: DecisionRequest, now: datetime,
                     actor_id: int) -> Lease:
        calls.append((lease.id, decision.action, actor_id))
        return lease

    monkeypatch.setattr(appeal_service, "apply_lease_decision", record)
    return calls


async def pending(session: AsyncSession) -> Appeal:
    marta = await make_user(session, "marta", team="qa")
    repo = await make_repo(session, "qa-automation")
    lease = await make_lease(session, marta, repo, Role.READ, granted_at=NOW - timedelta(days=27),
                             expires_at=NOW + timedelta(days=3))
    return await submit_appeal(session, lease_id=lease.id, justification="Release v2.1", now=NOW)


@pytest.mark.parametrize(("decision", "expected"), [
    (DecisionRequest(action=DecisionAction.EXTEND, extension=Extension(preset_days=14)), AppealStatus.APPROVED),
    (DecisionRequest(action=DecisionAction.DOWNSCOPE), AppealStatus.REJECTED),
    (DecisionRequest(action=DecisionAction.REVOKE), AppealStatus.REJECTED),
])
async def test_decision_resolves_appeal_and_delegates_to_lease_engine(
    session: AsyncSession, decisions: list, decision: DecisionRequest, expected: AppealStatus
) -> None:
    appeal = await pending(session)

    resolved = await decide_appeal(session, RecordingVCS(), appeal_id=appeal.id, decision=decision, now=NOW,
                                   actor_id=99)

    assert (resolved.status, resolved.resolved_at) == (expected, NOW)
    assert decisions == [(appeal.lease_id, decision.action, 99)]


async def test_decided_appeal_cannot_be_decided_again(session: AsyncSession, decisions: list) -> None:
    appeal = await pending(session)
    extend = DecisionRequest(action=DecisionAction.EXTEND, extension=Extension(preset_days=7))
    await decide_appeal(session, RecordingVCS(), appeal_id=appeal.id, decision=extend, now=NOW, actor_id=99)

    with pytest.raises(ServiceError) as again:
        await decide_appeal(session, RecordingVCS(), appeal_id=appeal.id, decision=extend, now=NOW, actor_id=99)

    assert again.value.status_code == 409
    assert len(decisions) == 1
