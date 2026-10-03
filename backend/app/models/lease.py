from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime


class Lease(Base):
    """Access lease == repo collaborator. `expires_at` is None for the permanent admin role."""

    __tablename__ = "leases"
    __table_args__ = (UniqueConstraint("user_id", "repo_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"), index=True)
    current_role: Mapped[str] = mapped_column(String(8))  # "admin" | "write" | "read"
    granted_at: Mapped[datetime] = mapped_column(UTCDateTime)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
