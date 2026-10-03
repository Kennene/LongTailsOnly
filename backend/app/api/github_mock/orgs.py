from fastapi import APIRouter, Depends, Request, Response

from app.api.github_mock.deps import get_mock_service
from app.api.github_mock.http import PageParams, paginate
from app.schemas.github_payloads import GHRepo, GHTeam, GHUser
from app.services.github_mock_service import GitHubMockService

router = APIRouter()


def _base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


@router.get("/orgs/{org}/members")
async def list_org_members(
    org: str, request: Request, response: Response, page: PageParams = Depends(),
    svc: GitHubMockService = Depends(get_mock_service),
) -> list[GHUser]:
    users = paginate(await svc.list_members(org), request, response, page)
    return [GHUser.from_user(u, _base(request)) for u in users]


@router.get("/orgs/{org}/teams")
async def list_org_teams(
    org: str, request: Request, response: Response, page: PageParams = Depends(),
    svc: GitHubMockService = Depends(get_mock_service),
) -> list[GHTeam]:
    teams = paginate(svc.list_teams(org), request, response, page)
    return [GHTeam.build(t.id, t.name, t.slug, org, _base(request)) for t in teams]


@router.get("/orgs/{org}/teams/{team_slug}/members")
async def list_team_members(
    org: str, team_slug: str, request: Request, response: Response, page: PageParams = Depends(),
    svc: GitHubMockService = Depends(get_mock_service),
) -> list[GHUser]:
    users = paginate(await svc.list_team_members(org, team_slug), request, response, page)
    return [GHUser.from_user(u, _base(request)) for u in users]


@router.get("/orgs/{org}/repos")
async def list_org_repos(
    org: str, request: Request, response: Response, page: PageParams = Depends(),
    svc: GitHubMockService = Depends(get_mock_service),
) -> list[GHRepo]:
    repos = paginate(await svc.list_repos(org), request, response, page)
    return [GHRepo.from_repo(r, _base(request)) for r in repos]


@router.get("/repos/{owner}/{repo}")
async def get_repo(
    owner: str, repo: str, request: Request, svc: GitHubMockService = Depends(get_mock_service),
) -> GHRepo:
    return GHRepo.from_repo(await svc.get_repo(owner, repo), _base(request))
