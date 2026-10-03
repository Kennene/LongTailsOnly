from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.team import Team


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    login: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(128))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), index=True)
    is_admin: Mapped[bool] = mapped_column(default=False)

    team: Mapped[Team | None] = relationship(lazy="selectin")
