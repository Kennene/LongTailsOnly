from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import str_enum
from app.domain.enums import Provider


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    owner: Mapped[str] = mapped_column(String(64))
    provider: Mapped[Provider] = mapped_column(str_enum(Provider), default=Provider.GITHUB, server_default=Provider.GITHUB.value)
    default_branch: Mapped[str] = mapped_column(String(64), default="main")
    default_lease_duration_days: Mapped[int] = mapped_column(default=30)
