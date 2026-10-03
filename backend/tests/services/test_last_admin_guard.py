"""Last Admin Protection (3.4, ADR 0004): one rule for the GitHub mock, the VCS adapter and the lease engine."""

from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import Role
from app.models import Lease, Repository, User
from app.services.errors import LastAdminError, ServiceError
from app.services.last_admin_guard import ORG_MESSAGE, REPO_MESSAGE, ensure_not_last_admin
from tests.factories import make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def grant(session: AsyncSession, user: User, repo: Repository, role: Role) -> Lease:
    expires = None if role is Role.ADMIN else NOW
    return await make_lease(session, user, repo, role, granted_at=NOW, expires_at=expires)


async def test_sole_org_owner_is_protected_in_every_repo(session: AsyncSession) -> None:
    owner = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    repo = await make_repo(session, "core-api")
    admin_lease = await grant(session, owner, repo, Role.ADMIN)
    write_lease = await grant(session, owner, await make_repo(session, "docs"), Role.WRITE)

    for lease in (admin_lease, write_lease):
        with pytest.raises(LastAdminError) as blocked:
            await ensure_not_last_admin(session, repository=lease.repository, user=owner, lease=lease)
        assert (blocked.value.status_code, blocked.value.detail) == (403, ORG_MESSAGE)


async def test_last_repo_admin_is_protected(session: AsyncSession) -> None:
    await make_user(session, "tomasz-admin", team=None, is_admin=True)
    await make_user(session, "second-owner", team=None, is_admin=True)
    kamil = await make_user(session, "kamil")
    repo = await make_repo(session, "solo")
    lease = await grant(session, kamil, repo, Role.ADMIN)

    with pytest.raises(LastAdminError) as blocked:
        await ensure_not_last_admin(session, repository=repo, user=kamil, lease=lease)
    assert blocked.value.detail == REPO_MESSAGE


async def test_second_repo_admin_can_go(session: AsyncSession) -> None:
    owner = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    kamil = await make_user(session, "kamil")
    repo = await make_repo(session, "payment-service")
    await grant(session, owner, repo, Role.ADMIN)
    kamil_admin = await grant(session, kamil, repo, Role.ADMIN)

    await ensure_not_last_admin(session, repository=repo, user=kamil, lease=kamil_admin)


async def test_regular_lease_is_never_blocked(session: AsyncSession) -> None:
    await make_user(session, "tomasz-admin", team=None, is_admin=True)
    marta = await make_user(session, "marta", team="qa")
    repo = await make_repo(session, "qa-automation")
    lease = await grant(session, marta, repo, Role.READ)

    await ensure_not_last_admin(session, repository=repo, user=marta, lease=lease)


def test_last_admin_error_is_a_403_service_error() -> None:
    error = LastAdminError(REPO_MESSAGE)
    assert isinstance(error, ServiceError)
    assert (error.status_code, error.detail) == (403, REPO_MESSAGE)
