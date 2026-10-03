from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.domain.enums import AppealStatus, Role
from app.schemas.base import ORMModel

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
