from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.database_vcs import DatabaseVCSAdapter
from app.core.time_provider import TimeProvider
from app.domain.enums import Role
from app.models import Lease
from app.ports.vcs_provider import VCSProvider
from app.services.errors import LastAdminError, ServiceError
from tests.factories import make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def adapter(session: AsyncSession) -> VCSProvider:
    return DatabaseVCSAdapter(session, TimeProvider(base_time_source=lambda: NOW))


async def test_set_permission_creates_lease_for_repo_policy(session: AsyncSession) -> None:
    await make_user(session, "nowy-dev")
    await make_repo(session, "core-api", lease_days=14)

    await adapter(session).set_permission("longtails", "core-api", "nowy-dev", Role.WRITE)

    lease = await session.scalar(select(Lease))
    assert lease is not None
    assert (lease.current_role, lease.granted_at, lease.expires_at, lease.is_active) == (
        Role.WRITE, NOW, NOW + timedelta(days=14), True)


async def test_set_permission_restores_revoked_lease(session: AsyncSession) -> None:
    user = await make_user(session, "kamil")
    repo = await make_repo(session, "legacy-reports")
    lease = await make_lease(session, user, repo, Role.WRITE, granted_at=NOW - timedelta(days=60),
                             expires_at=NOW - timedelta(days=30), is_active=False)

    await adapter(session).set_permission("longtails", "legacy-reports", "kamil", Role.READ)

    assert (lease.current_role, lease.is_active, lease.expires_at) == (Role.READ, True, NOW + timedelta(days=30))


async def test_unknown_repository_or_user_is_404(session: AsyncSession) -> None:
    await make_repo(session, "core-api")

    with pytest.raises(ServiceError) as error:
        await adapter(session).set_permission("longtails", "core-api", "ghost", Role.READ)

    assert error.value.status_code == 404


async def test_remove_collaborator_deactivates_the_lease(session: AsyncSession) -> None:
    user = await make_user(session, "kamil")
    repo = await make_repo(session, "legacy-reports")
    lease = await make_lease(session, user, repo, Role.WRITE, granted_at=NOW, expires_at=NOW + timedelta(days=3))

    await adapter(session).remove_collaborator("longtails", "legacy-reports", "kamil")
    await adapter(session).remove_collaborator("longtails", "legacy-reports", "kamil")  # idempotent

    assert lease.is_active is False


async def test_remove_collaborator_without_lease_does_nothing(session: AsyncSession) -> None:
    await make_user(session, "nowy-dev")
    await make_repo(session, "core-api")

    await adapter(session).remove_collaborator("longtails", "core-api", "nowy-dev")

    assert await session.scalar(select(Lease)) is None


async def test_remove_collaborator_keeps_the_last_admin(session: AsyncSession) -> None:
    owner = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    repo = await make_repo(session, "core-api")
    lease = await make_lease(session, owner, repo, Role.ADMIN, granted_at=NOW, expires_at=None)

    with pytest.raises(LastAdminError):
        await adapter(session).remove_collaborator("longtails", "core-api", "tomasz-admin")

    assert lease.is_active is True
