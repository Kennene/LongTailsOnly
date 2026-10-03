"""Shared FastAPI dependencies for API v1 (ADR 0011 §2)."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.database_vcs import DatabaseVCSAdapter
from app.core.config import Settings, get_settings
from app.core.enforcement_mode import EnforcementState, get_enforcement_state
from app.core.time_provider import TimeProvider, get_time_provider
from app.db.session import get_session
from app.models import User
from app.ports.vcs_provider import VCSProvider
from app.services.errors import ServiceError

SessionDep = Annotated[AsyncSession, Depends(get_session)]
ClockDep = Annotated[TimeProvider, Depends(get_time_provider)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
EnforcementDep = Annotated[EnforcementState, Depends(get_enforcement_state)]


async def get_admin_id(session: SessionDep, settings: SettingsDep) -> int:
    admin_id = await session.scalar(select(User.id).where(User.login == settings.admin_login))
    if admin_id is None:
        raise ServiceError(503, f"Admin account {settings.admin_login} is missing; run POST /api/v1/demo/reset")
    return admin_id


def get_vcs_provider(session: SessionDep, clock: ClockDep) -> VCSProvider:
    """Swap for the GitHub mock adapter once step 2.3 lands (ADR 0011 §3)."""
    return DatabaseVCSAdapter(session, clock)


AdminIdDep = Annotated[int, Depends(get_admin_id)]
VCSDep = Annotated[VCSProvider, Depends(get_vcs_provider)]
