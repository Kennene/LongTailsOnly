from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.time_provider import get_time_provider
from app.db.session import get_session
from app.ports.clock import ClockPort
from app.services.jira_issue_service import JiraIssueService
from app.services.jira_mock_service import JiraMockService
from app.services.jira_role_service import JiraRoleService

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ClockDep = Annotated[ClockPort, Depends(get_time_provider)]


def get_reads(session: SessionDep, settings: SettingsDep) -> JiraMockService:
    return JiraMockService(session, settings)


def get_roles(session: SessionDep, settings: SettingsDep, clock: ClockDep) -> JiraRoleService:
    return JiraRoleService(session, settings, clock)


def get_issues(session: SessionDep, settings: SettingsDep, clock: ClockDep) -> JiraIssueService:
    return JiraIssueService(session, settings, clock)


ReadsDep = Annotated[JiraMockService, Depends(get_reads)]
RolesDep = Annotated[JiraRoleService, Depends(get_roles)]
IssuesDep = Annotated[JiraIssueService, Depends(get_issues)]
