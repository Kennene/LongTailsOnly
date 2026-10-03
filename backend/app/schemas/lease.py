from datetime import datetime

from pydantic import BaseModel

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


class LeaseActivityStats(BaseModel):
    """Evidence of use for the decision modal: renewing actions in the lease window (docs/3-silnik-dzierzawy §6)."""

    lease_id: int
    window_days: int
    window_start: datetime
    window_end: datetime
    push_count: int
    review_count: int
    comment_count: int
    last_activity_at: datetime | None
