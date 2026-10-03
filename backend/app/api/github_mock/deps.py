from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.services.github_collaborator_service import GitHubCollaboratorService
from app.services.github_events_service import GitHubEventsService
from app.services.github_mock_service import GitHubMockService


def get_mock_service(request: Request, session: AsyncSession = Depends(get_session)) -> GitHubMockService:
    return GitHubMockService(session, request.app.state.settings)


def get_collaborator_service(
    request: Request, session: AsyncSession = Depends(get_session)
) -> GitHubCollaboratorService:
    return GitHubCollaboratorService(session, request.app.state.settings, request.app.state.clock)


def get_events_service(request: Request, session: AsyncSession = Depends(get_session)) -> GitHubEventsService:
    return GitHubEventsService(session, request.app.state.settings, request.app.state.clock)
