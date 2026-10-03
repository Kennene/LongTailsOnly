"""A deliberately tiny JQL subset for the Jira mock (ADR 0011, D6).

Supported: `project = KEY`, `updated >= "-30d" | "2026-09-01"`, `assignee|reporter|commenter = "accountId"`,
joined with AND, optional `ORDER BY updated|created [ASC|DESC]`. Anything else is a `JqlError`.
"""
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

_ORDER = re.compile(r"(?:^|\s+)order\s+by\s+(updated|created)(?:\s+(asc|desc))?\s*$", re.IGNORECASE)
_CLAUSE = re.compile(r"^(\w+)\s*(>=|=)\s*(.+)$")
_RELATIVE = re.compile(r"^-(\d+)([dwh])$")
_ACTORS = ("assignee", "reporter", "commenter")
_UNBOUNDED = "Unbounded JQL queries are not allowed here. Please add a search restriction to your query."


class JqlError(Exception):
    pass


@dataclass(frozen=True)
class Query:
    project: str | None = None
    since: datetime | None = None
    actor_field: str | None = None
    actor: str | None = None
    order_by: str = "updated"
    descending: bool = True


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def _parse_since(raw: str, now: datetime) -> datetime:
    value = _unquote(raw)
    if match := _RELATIVE.match(value):
        unit = {"d": "days", "w": "weeks", "h": "hours"}[match.group(2)]
        return now - timedelta(**{unit: int(match.group(1))})
    try:
        return datetime.fromisoformat(value).replace(tzinfo=UTC)
    except ValueError:
        raise JqlError(f"Date value '{value}' for field 'updated' is invalid. Valid formats include: 'yyyy/MM/dd', 'yyyy-MM-dd', or a period format e.g. '-5d', '4w 2d'.") from None


def parse_jql(jql: str, now: datetime) -> Query:
    text, order_by, descending = jql.strip(), "updated", True
    if match := _ORDER.search(text):
        order_by, descending = match.group(1).lower(), (match.group(2) or "desc").lower() == "desc"
        text = text[: match.start()]
    if re.search(r"\bOR\b", text, flags=re.IGNORECASE):
        raise JqlError("Error in the JQL Query: OR is not supported by this mock.")
    fields: dict[str, str] = {}
    for clause in filter(None, (c.strip() for c in re.split(r"\s+AND\s+", text, flags=re.IGNORECASE))):
        match = _CLAUSE.match(clause)
        if not match:
            raise JqlError(f"Error in the JQL Query: unsupported clause '{clause}'.")
        field, op, value = match.group(1).lower(), match.group(2), match.group(3)
        allowed = (field == "updated" and op == ">=") or (field in ("project", *_ACTORS) and op == "=")
        if not allowed or field in fields:
            raise JqlError(f"Error in the JQL Query: unsupported clause '{clause}'.")
        fields[field] = value
    actor_field = next((f for f in _ACTORS if f in fields), None)
    if len([f for f in _ACTORS if f in fields]) > 1:
        raise JqlError("Error in the JQL Query: only one of assignee, reporter, commenter is supported.")
    query = Query(
        project=_unquote(fields["project"]).upper() if "project" in fields else None,
        since=_parse_since(fields["updated"], now) if "updated" in fields else None,
        actor_field=actor_field,
        actor=_unquote(fields[actor_field]) if actor_field else None,
        order_by=order_by,
        descending=descending,
    )
    if query.project is None and query.since is None and query.actor is None:
        raise JqlError(_UNBOUNDED)
    return query
