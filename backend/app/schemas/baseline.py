from pydantic import BaseModel, field_validator

from app.domain.enums import Role
from app.schemas.base import ORMModel
from app.schemas.people import TeamRead, UserRead
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


class OnboardingProposal(BaseModel):
    """Team baseline split for one person: what approval would grant and what they already have (ADR 0010 §4)."""

    user: UserRead
    team: TeamRead
    to_grant: list[BaselineEntry]
    already_granted: list[BaselineEntry]
