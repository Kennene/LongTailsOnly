from app.schemas.base import ORMModel


class RepositoryRead(ORMModel):
    id: int
    name: str
    owner: str
    default_branch: str
    default_lease_duration_days: int
