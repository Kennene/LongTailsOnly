from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.github_mock.deps import get_collaborator_service, get_mock_service
from app.api.github_mock.http import PageParams, base_headers, paginate
from app.db.session import get_session
from app.models import User
from app.schemas.github_payloads import GHCollaborator, GHInvitation, GHPermission
from app.services.github_collaborator_service import GitHubCollaboratorService
from app.services.github_mock_service import GitHubMockService
from app.utils.dates import iso_z

router = APIRouter()


def _base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


@router.get("/repos/{owner}/{repo}/collaborators")
async def list_collaborators(
    owner: str, repo: str, request: Request, response: Response, page: PageParams = Depends(),
    svc: GitHubMockService = Depends(get_mock_service),
) -> list[GHCollaborator]:
    views = paginate(await svc.list_collaborators(owner, repo), request, response, page)
    return [GHCollaborator.from_view(v.user, v.role, _base(request)) for v in views]


@router.get("/repos/{owner}/{repo}/collaborators/{username}/permission")
async def get_collaborator_permission(
    owner: str, repo: str, username: str, request: Request,
    svc: GitHubMockService = Depends(get_mock_service),
) -> GHPermission:
    user, role = await svc.get_permission(owner, repo, username)
    return GHPermission.from_view(user, role, _base(request))


class PutCollaboratorBody(BaseModel):
    permission: str = "push"


@router.put("/repos/{owner}/{repo}/collaborators/{username}", response_model=None)
async def put_collaborator(
    owner: str, repo: str, username: str, request: Request, body: PutCollaboratorBody | None = None,
    svc: GitHubCollaboratorService = Depends(get_collaborator_service),
    session: AsyncSession = Depends(get_session),
) -> Response:
    body = body or PutCollaboratorBody()
    outcome, lease, repository, user = await svc.set_permission(owner, repo, username, body.permission)
    headers = base_headers(request)
    if outcome == "updated":
        return Response(status_code=204, headers=headers)
    inviter = await session.scalar(select(User).where(User.is_admin).order_by(User.id)) or user
    invitation = GHInvitation.build(
        lease.id, repository, user, inviter, lease.current_role,  # type: ignore[arg-type]
        iso_z(lease.granted_at), _base(request),
    )
    return JSONResponse(invitation.model_dump(mode="json"), status_code=201, headers=headers)


@router.delete("/repos/{owner}/{repo}/collaborators/{username}", status_code=204)
async def delete_collaborator(
    owner: str, repo: str, username: str, svc: GitHubCollaboratorService = Depends(get_collaborator_service),
) -> None:
    await svc.remove(owner, repo, username)
