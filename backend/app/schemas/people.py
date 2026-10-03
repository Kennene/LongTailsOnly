from app.schemas.base import ORMModel


class TeamRead(ORMModel):
    id: int
    slug: str
    name: str


class UserRead(ORMModel):
    id: int
    login: str
    name: str
    team: TeamRead | None
    is_admin: bool
