from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime)
    action_type: Mapped[str] = mapped_column(String(48))  # GitHub event type, e.g. PushEvent
    required_permission: Mapped[str] = mapped_column(String(8))  # "write" | "read" | "admin"
