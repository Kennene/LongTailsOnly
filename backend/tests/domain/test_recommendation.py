from datetime import UTC, datetime, timedelta

import pytest

from app.domain.enums import ActionType, LeaseStatus, Recommendation, Role
from app.domain.lease_rules import Activity, newest_activity, recommend

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
DAY = timedelta(days=1)
WINDOW_START = NOW - 30 * DAY


@pytest.mark.parametrize("status", [LeaseStatus.ACTIVE, LeaseStatus.PERMANENT, LeaseStatus.REVOKED])
def test_leases_that_need_no_action_keep(status: LeaseStatus) -> None:
    assert recommend(status, Role.WRITE, None) is Recommendation.KEEP


@pytest.mark.parametrize(("role", "newest", "expected"), [
    (Role.WRITE, None, Recommendation.REVOKE),
    (Role.WRITE, ActionType.PUSH, Recommendation.KEEP),
    (Role.WRITE, ActionType.PR_REVIEW, Recommendation.DOWNSCOPE),
    (Role.WRITE, ActionType.ISSUE_COMMENT, Recommendation.DOWNSCOPE),
    (Role.READ, ActionType.ISSUE_COMMENT, Recommendation.KEEP),
    (Role.READ, None, Recommendation.REVOKE),
])
@pytest.mark.parametrize("status", [LeaseStatus.WARNING, LeaseStatus.EXPIRED])
def test_lapsing_leases_follow_the_newest_activity(status: LeaseStatus, role: Role, newest: ActionType | None,
                                                   expected: Recommendation) -> None:
    assert recommend(status, role, newest) is expected


def test_newest_activity_wins_over_an_older_push() -> None:
    activity = [Activity(ActionType.PUSH, NOW - 25 * DAY), Activity(ActionType.PR_REVIEW, NOW - 2 * DAY)]
    assert newest_activity(activity, since=WINDOW_START, until=NOW) == activity[1]


def test_same_time_prefers_the_higher_level() -> None:
    activity = [Activity(ActionType.PR_REVIEW, NOW - DAY), Activity(ActionType.PUSH, NOW - DAY)]
    assert newest_activity(activity, since=WINDOW_START, until=NOW) == activity[1]


def test_window_skips_old_future_and_non_renewing_actions() -> None:
    activity = [
        Activity(ActionType.PUSH, NOW - 31 * DAY),
        Activity(ActionType.PUSH, NOW + DAY),
        Activity(ActionType.PR_MERGE, NOW - DAY),
        Activity(ActionType.ISSUE_COMMENT, WINDOW_START),
    ]
    assert newest_activity(activity, since=WINDOW_START, until=NOW) == activity[3]
    assert newest_activity(activity, since=None, until=NOW - 32 * DAY) is None
