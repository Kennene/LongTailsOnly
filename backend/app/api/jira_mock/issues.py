from typing import Annotated, Any

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request

from app.api.jira_mock.deps import IssuesDep
from app.api.jira_mock.http import MAX_RESULTS, PageParams, page
from app.domain.jira_events import status_after, status_change
from app.schemas.jira_payloads import ChangelogEntry, ChangelogItem, IssueRef, JiraComment, JiraUser, api
from app.models import User
from app.services.jira_issue_service import IssueView
from app.utils.dates import jira_dt

router = APIRouter(tags=["Jira · Zgłoszenia"])
Page = Annotated[PageParams, Depends()]


def _base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _fields(view: IssueView, base: str) -> dict[str, Any]:
    return {
        "summary": f"Issue {view.key}",
        "status": {"name": status_after(len(view.updates))},
        "issuetype": {"name": "Task"},
        "project": {"key": view.project.name, "id": str(view.project.id)},
        "created": jira_dt(view.created),
        "updated": jira_dt(view.updated),
        "reporter": JiraUser.from_user(view.reporter, base).model_dump(),
        "assignee": JiraUser.from_user(view.assignee, base).model_dump() if view.assignee else None,
    }


def _ref(view: IssueView, base: str, wanted: list[str]) -> IssueRef:
    number = view.key.rsplit("-", 1)[1]
    ref = IssueRef(id=f"{view.project.id}{number}", key=view.key, self=api(base, f"/issue/{view.key}"))
    if wanted:
        fields = _fields(view, base)
        ref.fields = fields if {"*all", "*navigable"} & set(wanted) else {k: v for k, v in fields.items() if k in wanted}
    return ref


def _wanted(fields: str | None) -> list[str]:
    return [f.strip() for f in fields.split(",") if f.strip()] if fields else []


@router.get("/search/jql")
async def search_jql(
    request: Request, svc: IssuesDep, jql: str = Query(""),
    max_results: Annotated[int, Query(alias="maxResults", ge=1)] = 50,
    next_page_token: Annotated[str | None, Query(alias="nextPageToken")] = None,
    fields: str | None = Query(None),
) -> dict[str, Any]:
    window, token = await svc.search(jql, min(max_results, MAX_RESULTS), next_page_token)
    body: dict[str, Any] = {"issues": [_ref(v, _base(request), _wanted(fields)) for v in window], "isLast": token is None}
    if token is not None:
        body["nextPageToken"] = token
    return body


@router.get("/issue/{key}")
async def get_issue(key: str, request: Request, svc: IssuesDep, fields: str | None = Query(None)) -> IssueRef:
    return _ref(await svc.issue(key), _base(request), _wanted(fields) or ["*all"])


def _entry(event_id: int, author: User, when: datetime, base: str) -> ChangelogEntry:
    before, after = status_change(event_id)
    return ChangelogEntry(
        id=str(30_000 + event_id), author=JiraUser.from_user(author, base), created=jira_dt(when),
        items=[ChangelogItem(field="status", fromString=before, toString=after)],
    )


@router.get("/issue/{key}/changelog")
async def get_changelog(key: str, request: Request, svc: IssuesDep, params: Page) -> dict[str, Any]:
    view = await svc.issue(key)
    ordered = sorted(view.updates, key=lambda pair: (pair[0].timestamp, pair[0].id))
    return page([_entry(e.id, u, e.timestamp, _base(request)) for e, u in ordered], params)


@router.get("/issue/{key}/comment")
async def get_comments(key: str, request: Request, svc: IssuesDep, params: Page) -> dict[str, Any]:
    view = await svc.issue(key)
    comments = [JiraComment.build(e.id, view.key, u, e.timestamp, _base(request)) for e, u in view.comments]
    return page(comments, params, key="comments")

