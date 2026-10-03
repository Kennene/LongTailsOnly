"""Last Admin Protection (step 3.4, ADR 0004): the single rule behind the GitHub mock, the VCS adapter and the engine.

- organization: the sole owner (`User.is_admin`) cannot be removed from any repository nor lose `admin`;
- repository: the last active `admin` lease of a repository cannot be removed nor demoted.
The guard only checks; whoever tried the change writes `LAST_ADMIN_BLOCKED` to the audit trail.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import Role
from app.models import Lease, Repository, User
from app.services.errors import LastAdminError

ORG_MESSAGE = "Cannot remove the last administrator of the organization"
REPO_MESSAGE = "Cannot remove the last administrator of the repository"


async def ensure_not_last_admin(session: AsyncSession, *, repository: Repository, user: User, lease: Lease) -> None:
    """Raise LastAdminError when removing or demoting `lease` would leave the org or the repo without an admin."""
    owners = await session.scalar(select(func.count()).select_from(User).where(User.is_admin))
    if user.is_admin and (owners or 0) <= 1:
        raise LastAdminError(ORG_MESSAGE)
    if lease.current_role is not Role.ADMIN:
        return
    admins = await session.scalar(select(func.count()).select_from(Lease).where(
        Lease.repo_id == repository.id, Lease.current_role == Role.ADMIN, Lease.is_active))
    if (admins or 0) <= 1:
        raise LastAdminError(REPO_MESSAGE)
