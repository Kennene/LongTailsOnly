from pydantic import field_validator

from app.domain.enums import Role
from app.schemas.base import ORMModel
from app.schemas.repository import RepositoryRead


class BaselineEntry(ORMModel):
    team_id: int
    repository: RepositoryRead
    proposed_role: Role
    active_members: int
    team_size: int

    @field_validator("proposed_role")
    @classmethod
    def never_admin(cls, role: Role) -> Role:
        if role is Role.ADMIN:
            raise ValueError("Admin is never part of a team baseline (ADR 0005)")
        return role
