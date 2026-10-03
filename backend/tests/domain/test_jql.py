from datetime import UTC, datetime, timedelta

import pytest

from app.services.jql import JqlError, parse_jql

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def test_project_and_relative_updated() -> None:
    q = parse_jql('project = pay AND updated >= "-30d" ORDER BY updated DESC', NOW)
    assert q.project == "PAY" and q.since == NOW - timedelta(days=30) and q.descending is True


def test_absolute_date_unquoted_relative_and_actor() -> None:
    q = parse_jql("updated >= 2026-09-01 and commenter = 'abc' order by created asc", NOW)
    assert q.since == datetime(2026, 9, 1, tzinfo=UTC)
    assert (q.actor_field, q.actor, q.order_by, q.descending) == ("commenter", "abc", "created", False)
    assert parse_jql("updated >= -2w", NOW).since == NOW - timedelta(weeks=2)
    assert parse_jql("project = X AND updated >= -5h", NOW).since == NOW - timedelta(hours=5)


@pytest.mark.parametrize(
    "jql",
    ["", "order by updated", "status = Done", "project != PAY", "project = A AND project = B",
     "assignee = a AND reporter = b", "updated >= yesterday", "project = A OR project = B", "(project = A)"],
)
def test_unsupported_or_unbounded_is_error(jql: str) -> None:
    with pytest.raises(JqlError):
        parse_jql(jql, NOW)


def test_unbounded_message_matches_jira() -> None:
    with pytest.raises(JqlError, match="Unbounded JQL queries are not allowed"):
        parse_jql("order by updated DESC", NOW)
