"""Deterministic Jira issue data derived from stored `ActivityEvent` rows (ADR 0016).

Nothing but the event is persisted. Issue events are grouped in runs of three consecutive ids counted
from the first Jira issue event (`origin`), so a seed that writes created -> updated -> comment in a row
yields one coherent issue. Seeds must therefore write Jira issue events contiguously, in groups of three.
"""
from app.domain.enums import ActionType

STATUSES: tuple[str, ...] = ("To Do", "In Progress", "In Review", "Done")
ISSUE_ACTIONS: frozenset[ActionType] = frozenset(
    {ActionType.JIRA_ISSUE_CREATED, ActionType.JIRA_ISSUE_UPDATED, ActionType.JIRA_COMMENT_CREATED}
)


ISSUE_RUN = 3


def issue_number(event_id: int, origin: int) -> int:
    return 100 + ((event_id - origin) // ISSUE_RUN) % 900


def issue_key(project_key: str, event_id: int, origin: int) -> str:
    return f"{project_key}-{issue_number(event_id, origin)}"


def status_change(event_id: int) -> tuple[str, str]:
    """(from, to) of the status transition recorded by an `issue_updated` event."""
    index = event_id % (len(STATUSES) - 1)
    return STATUSES[index], STATUSES[index + 1]


def status_after(updates: int) -> str:
    return STATUSES[min(updates, len(STATUSES) - 1)]
