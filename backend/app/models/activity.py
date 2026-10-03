from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime, str_enum
from app.domain.enums import ActionType, Role
from app.models.repository import Repository
from app.models.user import User


class ActivityEvent(Base):
    """Append-only telemetry mirroring GitHub's /events stream."""

    __tablename__ = "activity_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    action_type: Mapped[ActionType] = mapped_column(str_enum(ActionType))
    required_permission: Mapped[Role] = mapped_column(str_enum(Role))

    user: Mapped[User] = relationship(lazy="selectin")
    repository: Mapped[Repository] = relationship(lazy="selectin")
