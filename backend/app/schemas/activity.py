from datetime import datetime

from app.domain.enums import ActionType, Role
from app.schemas.base import ORMModel


class ActivityEventRead(ORMModel):
    id: int
    user_id: int
    repo_id: int
    timestamp: datetime
    action_type: ActionType
    required_permission: Role
