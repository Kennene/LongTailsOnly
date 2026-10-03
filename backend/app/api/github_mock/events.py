from fastapi import APIRouter, Depends, Request, Response

from app.api.github_mock.deps import get_events_service
from app.api.github_mock.http import PageParams, paginate
from app.domain.github_events import build_event_payload
from app.schemas.github_payloads import GHEvent
from app.services.github_events_service import GitHubEventsService

router = APIRouter(tags=["GitHub · Zdarzenia"])


@router.get("/repos/{owner}/{repo}/events")
async def list_repo_events(
    owner: str, repo: str, request: Request, response: Response, page: PageParams = Depends(),
    svc: GitHubEventsService = Depends(get_events_service),
) -> list[GHEvent]:
    repository, rows = await svc.list_events(owner, repo)
    base = str(request.base_url).rstrip("/")
    return [
        GHEvent.build(e, u, repository, build_event_payload(e, repository, u), base)
        for e, u in paginate(rows, request, response, page)
    ]
