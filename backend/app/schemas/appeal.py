from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.domain.enums import AppealStatus, Role
from app.schemas.base import ORMModel
from app.schemas.people import UserRead
from app.schemas.repository import RepositoryRead

Justification = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class AppealCreate(BaseModel):
    lease_id: int
    justification: Justification


class AppealRead(ORMModel):
    id: int
    lease_id: int
    user_id: int
    repo_id: int
    requested_role: Role
    justification: str
    status: AppealStatus
    created_at: datetime
    resolved_at: datetime | None


class AppealRejectRequest(BaseModel):
    justification: Justification


class AppealOverview(AppealRead):
    """Appeal with everything the admin needs to decide, computed by the backend (UC-3, ADR 0014 §4)."""

    user: UserRead
    repository: RepositoryRead
    lease_role: Role
    lease_expires_at: datetime | None
    lease_is_active: bool
    days_remaining: int | None
    recent_activity_count: int
    previous_appeals: int
