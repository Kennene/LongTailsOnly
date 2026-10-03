from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request

from app.api.jira_mock.deps import ReadsDep
from app.api.jira_mock.http import JiraError, PageParams, page
from app.schemas.jira_payloads import JiraGroup, JiraUser, api

router = APIRouter(tags=["Jira · Użytkownicy i grupy"])
Page = Annotated[PageParams, Depends()]


def _base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


@router.get("/user")
async def get_user(request: Request, svc: ReadsDep, account_id: Annotated[str, Query(alias="accountId")]) -> JiraUser:
    return JiraUser.from_user(await svc.require_user(account_id), _base(request))


@router.get("/user/search")
async def search_users(
    request: Request, svc: ReadsDep, params: Page, query: str = Query(""),
) -> list[JiraUser]:
    needle = query.lower()
    users = [u for u in await svc.users() if needle in u.name.lower() or needle in u.login.lower()]
    window = users[params.start_at : params.start_at + params.max_results]
    return [JiraUser.from_user(u, _base(request)) for u in window]


@router.get("/group/bulk")
async def groups_bulk(request: Request, svc: ReadsDep, params: Page) -> dict[str, Any]:
    groups = [
        JiraGroup(name=t.name, groupId=f"group-{t.id}", self=api(_base(request), f"/group?groupname={t.name}"))
        for t in await svc.groups()
    ]
    return page(groups, params)


@router.get("/group/member")
async def group_members(
    request: Request, svc: ReadsDep, params: Page, groupname: str | None = Query(None),
) -> dict[str, Any]:
    if not groupname:
        raise JiraError(400, "Either 'groupname' or 'groupId' must be provided.")
    users = [JiraUser.from_user(u, _base(request)) for u in await svc.group_members(groupname)]
    return page(users, params)
