from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_provider import TimeProvider
from app.db.seed import seed_demo_data
from app.domain.enums import ActionType, Role
from app.services.baseline_service import get_team_baseline, team_by_slug
from app.services.errors import ServiceError
from tests.factories import make_event, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def summary(entries: list) -> list[tuple[str, int, Role]]:
    return [(e.repository.name, e.active_members, e.proposed_role) for e in entries]


async def test_baseline_counts_only_non_admin_team_members(session: AsyncSession) -> None:
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    devs = [await make_user(session, f"dev{index}") for index in range(4)]
    qa = await make_user(session, "marta", team="qa")
    core = await make_repo(session, "core-api")
    docs = await make_repo(session, "docs-portal")
    for dev in devs[:2]:
        await make_event(session, dev, core, ActionType.PUSH, NOW - timedelta(days=1))
    for outsider in (admin, qa, devs[0]):
        await make_event(session, outsider, docs, ActionType.PUSH, NOW - timedelta(days=1))

    entries = await get_team_baseline(session, await team_by_slug(session, "dev"), NOW)

    assert summary(entries) == [("core-api", 2, Role.WRITE)]
    assert {(e.team_id, e.team_size) for e in entries} == {(devs[0].team_id, 4)}


async def test_entries_are_sorted_by_repository_name(session: AsyncSession) -> None:
    dev = await make_user(session, "dev0")
    for name in ("zeta-svc", "alpha-svc"):
        await make_event(session, dev, await make_repo(session, name), ActionType.PR_REVIEW, NOW - timedelta(days=2))

    entries = await get_team_baseline(session, await team_by_slug(session, "dev"), NOW)

    assert summary(entries) == [("alpha-svc", 1, Role.READ), ("zeta-svc", 1, Role.READ)]


async def test_unknown_team_is_404(session: AsyncSession) -> None:
    with pytest.raises(ServiceError) as error:
        await team_by_slug(session, "ops")

    assert (error.value.status_code, error.value.detail) == (404, "Team ops not found")


async def test_demo_seed_baseline(session: AsyncSession) -> None:
    await seed_demo_data(session, TimeProvider(base_time_source=lambda: NOW))

    dev = await get_team_baseline(session, await team_by_slug(session, "dev"), NOW)
    qa = await get_team_baseline(session, await team_by_slug(session, "qa"), NOW)

    assert [(e.repository.name, e.proposed_role) for e in dev] == [
        ("auth-service", Role.WRITE), ("core-api", Role.WRITE), ("payment-service", Role.READ)]
    assert [(e.repository.name, e.proposed_role, e.active_members) for e in qa] == [
        ("qa-automation", Role.READ, 6)]
