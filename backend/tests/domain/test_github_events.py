from datetime import UTC, datetime

import pytest

from app.domain.enums import ActionType, Role
from app.domain.github_events import build_event_payload
from app.domain.roles import RENEWING_ACTIONS, is_renewing, required_permission_for
from app.models import ActivityEvent, Repository, User

T = datetime(2026, 9, 20, 10, 0, tzinfo=UTC)
USER = User(id=3, login="dev-01", name="Dev One", team_id=1, is_admin=False)
REPO = Repository(id=2, name="core-api", owner="longtails", default_branch="main")


def event(action_type: ActionType, event_id: int = 7) -> ActivityEvent:
    return ActivityEvent(
        id=event_id, user_id=3, repo_id=2, timestamp=T, action_type=action_type,
        required_permission=required_permission_for(action_type),
    )


GITHUB_ACTIONS = [
    ActionType.PUSH, ActionType.PR_MERGE, ActionType.PR_REVIEW,
    ActionType.ISSUE_COMMENT, ActionType.ISSUE_LABEL, ActionType.REPO_SETTINGS,
]


def test_event_type_permission_table_and_renewing_set() -> None:
    assert {a.value: required_permission_for(a) for a in GITHUB_ACTIONS} == {
        "PushEvent": Role.WRITE,
        "PullRequestEvent": Role.WRITE,
        "PullRequestReviewEvent": Role.READ,
        "IssueCommentEvent": Role.READ,
        "IssuesEvent": Role.READ,
        "PublicEvent": Role.ADMIN,
    }
    assert {ActionType.PUSH, ActionType.PR_REVIEW, ActionType.ISSUE_COMMENT} <= RENEWING_ACTIONS
    assert not any(is_renewing(a) for a in (ActionType.PR_MERGE, ActionType.ISSUE_LABEL, ActionType.REPO_SETTINGS))


def test_jira_action_levels_and_renewal() -> None:
    assert {a.value: required_permission_for(a) for a in ActionType if a not in GITHUB_ACTIONS} == {
        "jira:issue_created": Role.WRITE,
        "jira:issue_updated": Role.WRITE,
        "comment_created": Role.READ,
        "project_updated": Role.ADMIN,
    }
    assert is_renewing(ActionType.JIRA_ISSUE_UPDATED) and is_renewing(ActionType.JIRA_COMMENT_CREATED)
    assert not is_renewing(ActionType.JIRA_PROJECT_UPDATED)


def test_push_payload() -> None:
    p = build_event_payload(event(ActionType.PUSH), REPO, USER)
    assert p["ref"] == "refs/heads/main" and p["size"] >= 1 and p["distinct_size"] == p["size"]
    assert len(p["head"]) == 40 and len(p["before"]) == 40 and p["head"] != p["before"]
    assert len(p["commits"]) == p["size"]
    assert p["commits"][-1]["sha"] == p["head"]
    assert {"sha", "author", "message", "distinct", "url"} <= p["commits"][0].keys()


def test_merge_payload() -> None:
    p = build_event_payload(event(ActionType.PR_MERGE), REPO, USER)
    assert p["action"] == "closed" and p["pull_request"]["merged"] is True
    assert p["number"] == p["pull_request"]["number"]
    assert p["pull_request"]["base"]["ref"] == "main"


def test_review_payload() -> None:
    p = build_event_payload(event(ActionType.PR_REVIEW), REPO, USER)
    assert p["action"] == "created"
    assert p["review"]["state"] in {"approved", "commented", "changes_requested"}
    assert p["review"]["user"]["login"] == "dev-01"
    assert "number" in p["pull_request"]


def test_issue_comment_payload() -> None:
    p = build_event_payload(event(ActionType.ISSUE_COMMENT), REPO, USER)
    assert p["action"] == "created" and "number" in p["issue"]
    assert p["comment"]["user"]["login"] == "dev-01" and p["comment"]["body"]


def test_label_payload() -> None:
    p = build_event_payload(event(ActionType.ISSUE_LABEL), REPO, USER)
    assert p["action"] == "labeled" and p["label"]["name"] and len(p["label"]["color"]) == 6
    assert "number" in p["issue"]


def test_settings_change_payload_is_public_event() -> None:
    assert build_event_payload(event(ActionType.REPO_SETTINGS), REPO, USER) == {}


@pytest.mark.parametrize("kind", GITHUB_ACTIONS)
def test_payload_is_deterministic(kind: ActionType) -> None:
    assert build_event_payload(event(kind), REPO, USER) == build_event_payload(event(kind), REPO, USER)


def test_payload_differs_between_events() -> None:
    a = build_event_payload(event(ActionType.PUSH, 7), REPO, USER)
    b = build_event_payload(event(ActionType.PUSH, 8), REPO, USER)
    assert a["head"] != b["head"]
