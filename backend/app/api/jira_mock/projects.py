from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.api.jira_mock.deps import ReadsDep
from app.api.jira_mock.http import PageParams, page
from app.schemas.jira_payloads import JiraProject

router = APIRouter()
Page = Annotated[PageParams, Depends()]


def _base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


@router.get("/project/search")
async def search_projects(request: Request, params: Page, svc: ReadsDep) -> dict[str, Any]:
    projects = [JiraProject.from_repo(p, _base(request)) for p in await svc.projects()]
    return page(projects, params)


@router.get("/project/{key_or_id}")
async def get_project(key_or_id: str, request: Request, svc: ReadsDep) -> JiraProject:
    return JiraProject.from_repo(await svc.project(key_or_id), _base(request))
