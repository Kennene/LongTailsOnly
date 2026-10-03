"""Shared FastAPI dependencies for API v1 (ADR 0014 §2)."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.adapters.demo_service  # noqa: F401 — imported for its registration side effect
from app.adapters.database_vcs import DatabaseVCSAdapter
from app.core.config import Settings, get_settings
from app.core.enforcement_mode import EnforcementState, get_enforcement_state
from app.core.time_provider import TimeProvider, get_time_provider
from app.db.session import get_session
from app.models import User
from app.ports.service_registry import all_services
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


def resolve_vcs_provider(session: SessionDep, clock: ClockDep, service_id: str) -> VCSProvider:
    """Resolve a registered service to its adapter; an unknown id is a 404.

    Kept separate from `get_vcs_provider` so the seam exists in Python without leaking a
    `service_id` query parameter onto every endpoint that depends on `VCSDep` (FastAPI promotes
    a dependency's scalar parameter).
    """
    if service_id not in {service.id for service in all_services()}:
        raise ServiceError(404, f"Unknown service {service_id}")
    return DatabaseVCSAdapter(session, clock)


def get_vcs_provider(session: SessionDep, clock: ClockDep) -> VCSProvider:
    """The default VCS provider (ADR 0014 §3). Per-request selection goes through `resolve_vcs_provider`."""
    return resolve_vcs_provider(session, clock, "github")


AdminIdDep = Annotated[int, Depends(get_admin_id)]
VCSDep = Annotated[VCSProvider, Depends(get_vcs_provider)]
