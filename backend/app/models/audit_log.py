from datetime import datetime
from typing import Any

from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, str_enum
from app.domain.enums import ActorType


class AuditLog(Base):
    """Append-only audit trail: never UPDATE or DELETE rows."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    actor_type: Mapped[ActorType] = mapped_column(str_enum(ActorType))
    actor_id: Mapped[int | None] = mapped_column()
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[str] = mapped_column(String(200))
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    justification: Mapped[str | None] = mapped_column(Text)
