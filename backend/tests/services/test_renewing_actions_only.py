"""ADR 0010 (Person 2): only RENEWING_ACTIONS count as evidence of use - merges, labels and settings never do."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType, Role
from app.services.appeal_service import build_appeal_overviews, submit_appeal
from app.services.baseline_service import get_team_baseline, team_by_slug
from tests.factories import make_event, make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
MOCK_ONLY = (ActionType.PR_MERGE, ActionType.ISSUE_LABEL, ActionType.REPO_SETTINGS)


async def test_mock_only_events_do_not_build_a_team_baseline(session: AsyncSession) -> None:
    devs = [await make_user(session, f"dev{index}") for index in range(2)]
    repo = await make_repo(session, "core-api")
    for dev in devs:
        for action in MOCK_ONLY:
            await make_event(session, dev, repo, action, NOW - timedelta(days=1))

    assert await get_team_baseline(session, await team_by_slug(session, "dev"), NOW) == []


async def test_mock_only_events_do_not_count_as_recent_activity(session: AsyncSession) -> None:
    marta = await make_user(session, "marta", team="qa")
    repo = await make_repo(session, "qa-automation")
    lease = await make_lease(session, marta, repo, Role.READ, granted_at=NOW - timedelta(days=27),
                             expires_at=NOW + timedelta(days=3))
    for action in (*MOCK_ONLY, ActionType.ISSUE_COMMENT):
        await make_event(session, marta, repo, action, NOW - timedelta(days=1))
    appeal = await submit_appeal(session, lease_id=lease.id, justification="Release", now=NOW)

    (overview,) = await build_appeal_overviews(session, [appeal], NOW)

    assert overview.recent_activity_count == 1
