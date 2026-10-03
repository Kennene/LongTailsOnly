from datetime import datetime

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime, str_enum
from app.domain.enums import AppealStatus, Role
from app.models.lease import Lease


class Appeal(Base):
    __tablename__ = "appeals"

    id: Mapped[int] = mapped_column(primary_key=True)
    lease_id: Mapped[int] = mapped_column(ForeignKey("leases.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"))
    requested_role: Mapped[Role] = mapped_column(str_enum(Role))
    justification: Mapped[str] = mapped_column(Text)
    status: Mapped[AppealStatus] = mapped_column(str_enum(AppealStatus), default=AppealStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime())
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    lease: Mapped[Lease] = relationship(lazy="selectin")
