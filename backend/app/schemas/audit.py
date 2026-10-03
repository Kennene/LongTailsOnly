from datetime import datetime
from typing import Any

from app.domain.enums import ActorType
from app.schemas.base import ORMModel


class AuditLogRead(ORMModel):
    id: int
    timestamp: datetime
    actor_type: ActorType
    actor_id: int | None
    action: str
    target: str
    details: dict[str, Any]
    justification: str | None


class AuditEntry(AuditLogRead):
    """Audit row with the actor's login resolved, so the UI does not join users itself (ADR 0014 §4)."""

    actor_login: str | None
