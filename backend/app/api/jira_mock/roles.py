from fastapi import APIRouter, Query, Request, Response
from pydantic import BaseModel, Field

from app.api.jira_mock.deps import ReadsDep, RolesDep
from app.api.jira_mock.http import JiraError
from app.domain.jira_roles import JiraRole
from app.models import Repository
from app.schemas.jira_payloads import JiraRoleSummary, ProjectRole, api

router = APIRouter(tags=["Jira · Role projektowe"])


def _base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


class AddActorsBody(BaseModel):
    user: list[str] = Field(default_factory=list)
    group: list[str] = Field(default_factory=list)


class SetActorsBody(BaseModel):
    categorisedActors: dict[str, list[str]] = Field(default_factory=dict)


def _reject_groups(groups: list[str]) -> None:
    if groups:
        raise JiraError(400, "Group actors are not supported by this mock; use user actors.")


@router.get("/role")
async def list_roles(request: Request, svc: ReadsDep) -> list[JiraRoleSummary]:
    return [JiraRoleSummary.build(r, _base(request)) for r in await svc.role_names()]


@router.get("/project/{project}/role")
async def project_roles(project: str, request: Request, svc: ReadsDep) -> dict[str, str]:
    repo = await svc.project(project)
    return {r.name: api(_base(request), f"/project/{repo.id}/role/{r.id}") for r in await svc.role_names()}


@router.get("/project/{project}/role/{role_id}")
async def project_role(project: str, role_id: str, request: Request, svc: ReadsDep) -> ProjectRole:
    repo, role = await svc.project(project), svc.role(role_id)
    return ProjectRole.build(repo, role, await svc.actors(repo, role.role), _base(request))


async def _render(request: Request, svc: ReadsDep, project: Repository, role: JiraRole) -> ProjectRole:
    return ProjectRole.build(project, role, await svc.actors(project, role.role), _base(request))


@router.post("/project/{project}/role/{role_id}")
async def add_actors(project: str, role_id: str, body: AddActorsBody, request: Request, svc: ReadsDep, roles: RolesDep) -> ProjectRole:
    _reject_groups(body.group)
    repo, role = await roles.add_actors(project, role_id, body.user)
    return await _render(request, svc, repo, role)


@router.put("/project/{project}/role/{role_id}")
async def set_actors(project: str, role_id: str, body: SetActorsBody, request: Request, svc: ReadsDep, roles: RolesDep) -> ProjectRole:
    _reject_groups(body.categorisedActors.get("atlassian-group-role-actor", []))
    users = body.categorisedActors.get("atlassian-user-role-actor", [])
    repo, role = await roles.set_actors(project, role_id, users)
    return await _render(request, svc, repo, role)


@router.delete("/project/{project}/role/{role_id}", status_code=204)
async def remove_actor(project: str, role_id: str, roles: RolesDep, user: str | None = Query(None), group: str | None = Query(None)) -> Response:
    if group:
        _reject_groups([group])
    if not user:
        raise JiraError(400, "The 'user' query parameter is required.")
    await roles.remove_actor(project, role_id, user)
    return Response(status_code=204)
