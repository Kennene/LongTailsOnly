"""Shared FastAPI dependencies for API v1 (ADR 0010 §2)."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.time_provider import TimeProvider, get_time_provider
from app.db.session import get_session

SessionDep = Annotated[AsyncSession, Depends(get_session)]
ClockDep = Annotated[TimeProvider, Depends(get_time_provider)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
