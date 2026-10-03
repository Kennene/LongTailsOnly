from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request

from app.api.jira_mock.deps import IssuesDep
from app.api.jira_mock.http import JiraError
from app.domain.jira_roles import account_id
from app.utils.dates import jira_dt

router = APIRouter()
MAX_LIMIT = 1000


def _parse(value: str | None, name: str) -> datetime | None:
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise JiraError(400, f"Invalid value for '{name}'.") from None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


@router.get("/auditing/record")
async def audit_records(
    request: Request, svc: IssuesDep, offset: int = Query(0, ge=0),
    limit: Annotated[int, Query(ge=1)] = MAX_LIMIT, since: Annotated[str | None, Query(alias="from")] = None,
    until: Annotated[str | None, Query(alias="to")] = None,
) -> dict[str, Any]:
    start, end = _parse(since, "from"), _parse(until, "to")
    rows = [
        r for r in await svc.audit_records()
        if (start is None or r[0].timestamp >= start) and (end is None or r[0].timestamp <= end)
    ]
    limit = min(limit, MAX_LIMIT)
    records = [
        {
            "id": 40_000 + event.id, "summary": "Project updated", "created": jira_dt(event.timestamp),
            "category": "projects", "eventSource": "Jira", "authorAccountId": account_id(user.login),
            "objectItem": {"id": str(repo.id), "name": repo.name, "typeName": "PROJECT"},
        }
        for event, user, repo in rows[offset : offset + limit]
    ]
    return {"offset": offset, "limit": limit, "total": len(rows), "records": records}
