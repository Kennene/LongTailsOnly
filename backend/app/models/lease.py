from datetime import datetime

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime, str_enum
from app.domain.enums import Role
from app.models.repository import Repository
from app.models.user import User


class Lease(Base):
    __tablename__ = "leases"
    __table_args__ = (UniqueConstraint("user_id", "repo_id", name="uq_lease_user_repo"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"), index=True)
    current_role: Mapped[Role] = mapped_column(str_enum(Role))
    granted_at: Mapped[datetime] = mapped_column(UTCDateTime())
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime())  # NULL = permanent admin
    is_active: Mapped[bool] = mapped_column(default=True)

    user: Mapped[User] = relationship(lazy="selectin")
    repository: Mapped[Repository] = relationship(lazy="selectin")
