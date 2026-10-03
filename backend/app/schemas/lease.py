from datetime import datetime

from app.domain.enums import LeaseStatus, Recommendation, Role
from app.schemas.base import ORMModel
from app.schemas.people import UserRead
from app.schemas.repository import RepositoryRead


class LeaseRead(ORMModel):
    id: int
    user: UserRead
    repository: RepositoryRead
    current_role: Role
    granted_at: datetime
    expires_at: datetime | None
    is_active: bool


class LeaseOverview(LeaseRead):
    """Lease plus values computed by the lease service (Task 8 of the team plan)."""

    status: LeaseStatus
    days_remaining: int | None
    last_activity_at: datetime | None
    recommendation: Recommendation
