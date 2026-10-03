from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.time_provider import get_time_provider
from app.db.session import get_session
from app.ports.clock import ClockPort
from app.services.github_collaborator_service import GitHubCollaboratorService
from app.services.github_events_service import GitHubEventsService
from app.services.github_mock_service import GitHubMockService

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ClockDep = Annotated[ClockPort, Depends(get_time_provider)]


def get_mock_service(session: SessionDep, settings: SettingsDep) -> GitHubMockService:
    return GitHubMockService(session, settings)


def get_collaborator_service(
    session: SessionDep, settings: SettingsDep, clock: ClockDep
) -> GitHubCollaboratorService:
    return GitHubCollaboratorService(session, settings, clock)


def get_events_service(session: SessionDep, settings: SettingsDep, clock: ClockDep) -> GitHubEventsService:
    return GitHubEventsService(session, settings, clock)
