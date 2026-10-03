from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType, ActorType, Role
from app.models import AuditLog, Repository, User
from app.services.baseline_service import apply_onboarding, get_onboarding_proposal
from app.services.errors import ServiceError
from tests.factories import make_event, make_lease, make_repo, make_user
from tests.fakes import RecordingVCS

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def team_with_two_baseline_repos(session: AsyncSession) -> dict[str, User | Repository]:
    devs = [await make_user(session, f"dev{index}") for index in range(3)]
    newcomer = await make_user(session, "nowy-dev")
    repos = {}
    for name in ("core-api", "frontend-app"):
        repos[name] = await make_repo(session, name)
        for dev in devs[:2]:
            await make_event(session, dev, repos[name], ActionType.PUSH, NOW - timedelta(days=1))
    return {"newcomer": newcomer, **repos}


def names(entries: list) -> list[str]:
    return [entry.repository.name for entry in entries]


async def test_proposal_for_new_member_counts_them_in_the_team(session: AsyncSession) -> None:
    await team_with_two_baseline_repos(session)

    proposal = await get_onboarding_proposal(session, login="nowy-dev", now=NOW)

    assert (proposal.user.login, proposal.team.slug) == ("nowy-dev", "dev")
    assert [(e.repository.name, e.proposed_role, e.team_size) for e in proposal.to_grant] == [
        ("core-api", Role.WRITE, 4), ("frontend-app", Role.WRITE, 4)]
    assert proposal.already_granted == []


async def test_apply_grants_only_missing_repos_and_audits(session: AsyncSession) -> None:
    world = await team_with_two_baseline_repos(session)
    await make_lease(session, world["newcomer"], world["core-api"], Role.READ, granted_at=NOW,
                     expires_at=NOW + timedelta(days=30))
    vcs = RecordingVCS()

    await apply_onboarding(session, vcs, login="nowy-dev", now=NOW, actor_id=99)

    assert vcs.calls == [("longtails/frontend-app", "nowy-dev", "write")]
    audit = (await session.scalars(select(AuditLog))).all()
    assert [(a.actor_type, a.actor_id, a.action, a.target, a.details) for a in audit] == [
        (ActorType.ADMIN, 99, "BASELINE_APPLIED", "dev:nowy-dev", {"granted": {"frontend-app": "write"}})]


async def test_nothing_to_grant_means_no_vcs_call_and_no_audit(session: AsyncSession) -> None:
    world = await team_with_two_baseline_repos(session)
    for name in ("core-api", "frontend-app"):
        await make_lease(session, world["newcomer"], world[name], Role.WRITE, granted_at=NOW,
                         expires_at=NOW + timedelta(days=30))
    vcs = RecordingVCS()

    proposal = await apply_onboarding(session, vcs, login="nowy-dev", now=NOW, actor_id=99)

    assert vcs.calls == []
    assert (proposal.to_grant, names(proposal.already_granted)) == ([], ["core-api", "frontend-app"])
    assert (await session.scalars(select(AuditLog))).all() == []


async def test_revoked_access_is_proposed_again(session: AsyncSession) -> None:
    world = await team_with_two_baseline_repos(session)
    await make_lease(session, world["newcomer"], world["core-api"], Role.WRITE, granted_at=NOW - timedelta(days=60),
                     expires_at=NOW - timedelta(days=30), is_active=False)

    proposal = await get_onboarding_proposal(session, login="nowy-dev", now=NOW)

    assert names(proposal.to_grant) == ["core-api", "frontend-app"]


async def test_admin_without_team_and_unknown_login_are_rejected(session: AsyncSession) -> None:
    await make_user(session, "tomasz-admin", team=None, is_admin=True)

    with pytest.raises(ServiceError) as admin:
        await get_onboarding_proposal(session, login="tomasz-admin", now=NOW)
    with pytest.raises(ServiceError) as ghost:
        await apply_onboarding(session, RecordingVCS(), login="ghost", now=NOW, actor_id=1)

    assert (admin.value.status_code, admin.value.detail) == (422, "User tomasz-admin does not belong to a team")
    assert (ghost.value.status_code, ghost.value.detail) == (404, "User ghost not found")
