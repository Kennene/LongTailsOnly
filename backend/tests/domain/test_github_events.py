from datetime import UTC, datetime

import pytest

from app.domain.github_events import (
    EVENT_REQUIRED_PERMISSION,
    LEASE_RENEWING_EVENT_TYPES,
    build_event_payload,
)
from app.models import ActivityEvent, Repository, User

T = datetime(2026, 9, 20, 10, 0, tzinfo=UTC)
USER = User(id=3, login="dev-01", name="Dev One", team="DEV", is_admin=False)
REPO = Repository(id=2, name="core-api", owner="longtails", default_branch="main")


def event(action_type: str, event_id: int = 7) -> ActivityEvent:
    return ActivityEvent(id=event_id, user_id=3, repo_id=2, timestamp=T, action_type=action_type, required_permission="write")


def test_event_type_permission_table_and_renewing_set() -> None:
    assert EVENT_REQUIRED_PERMISSION == {
        "PushEvent": "write",
        "PullRequestEvent": "write",
        "PullRequestReviewEvent": "read",
        "IssueCommentEvent": "read",
        "IssuesEvent": "read",
        "PublicEvent": "admin",
    }
    assert LEASE_RENEWING_EVENT_TYPES == {"PushEvent", "PullRequestReviewEvent", "IssueCommentEvent"}


def test_push_payload() -> None:
    p = build_event_payload(event("PushEvent"), REPO, USER)
    assert p["ref"] == "refs/heads/main" and p["size"] >= 1 and p["distinct_size"] == p["size"]
    assert len(p["head"]) == 40 and len(p["before"]) == 40 and p["head"] != p["before"]
    assert len(p["commits"]) == p["size"]
    assert p["commits"][-1]["sha"] == p["head"]
    assert {"sha", "author", "message", "distinct", "url"} <= p["commits"][0].keys()


def test_merge_payload() -> None:
    p = build_event_payload(event("PullRequestEvent"), REPO, USER)
    assert p["action"] == "closed" and p["pull_request"]["merged"] is True
    assert p["number"] == p["pull_request"]["number"]
    assert p["pull_request"]["base"]["ref"] == "main"


def test_review_payload() -> None:
    p = build_event_payload(event("PullRequestReviewEvent"), REPO, USER)
    assert p["action"] == "created"
    assert p["review"]["state"] in {"approved", "commented", "changes_requested"}
    assert p["review"]["user"]["login"] == "dev-01"
    assert "number" in p["pull_request"]


def test_issue_comment_payload() -> None:
    p = build_event_payload(event("IssueCommentEvent"), REPO, USER)
    assert p["action"] == "created" and "number" in p["issue"]
    assert p["comment"]["user"]["login"] == "dev-01" and p["comment"]["body"]


def test_label_payload() -> None:
    p = build_event_payload(event("IssuesEvent"), REPO, USER)
    assert p["action"] == "labeled" and p["label"]["name"] and len(p["label"]["color"]) == 6
    assert "number" in p["issue"]


def test_settings_change_payload_is_public_event() -> None:
    assert build_event_payload(event("PublicEvent"), REPO, USER) == {}


def test_unknown_type_has_empty_payload() -> None:
    assert build_event_payload(event("WatchEvent"), REPO, USER) == {}


@pytest.mark.parametrize("kind", sorted(EVENT_REQUIRED_PERMISSION))
def test_payload_is_deterministic(kind: str) -> None:
    assert build_event_payload(event(kind), REPO, USER) == build_event_payload(event(kind), REPO, USER)


def test_payload_differs_between_events() -> None:
    a = build_event_payload(event("PushEvent", 7), REPO, USER)
    b = build_event_payload(event("PushEvent", 8), REPO, USER)
    assert a["head"] != b["head"]
