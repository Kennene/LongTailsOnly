from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.appeal_service as appeal_service
from app.adapters.database_vcs import DatabaseVCSAdapter
from app.core.config import Settings
from app.core.time_provider import TimeProvider
from app.db.seed_data import ADMIN_LOGIN
from app.domain.enums import AppealStatus, Role
from app.domain.lease_window import days_remaining
from app.models import Appeal
from app.services.appeal_service import build_appeal_overviews, submit_appeal
from app.services.errors import ServiceError
from tests.factories import make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def warning_lease(session: AsyncSession, *, is_active: bool = True):  # noqa: ANN201
    marta = await make_user(session, "marta", team="qa")
    repo = await make_repo(session, "qa-automation")
    return await make_lease(session, marta, repo, Role.READ, granted_at=NOW - timedelta(days=27),
                            expires_at=NOW + timedelta(days=3), is_active=is_active)


async def test_database_allows_only_one_pending_appeal_per_lease(session: AsyncSession) -> None:
    lease = await warning_lease(session)
    for text in ("first", "second"):
        session.add(Appeal(lease=lease, user_id=lease.user_id, repo_id=lease.repo_id, requested_role=Role.READ,
                           justification=text, status=AppealStatus.PENDING, created_at=NOW))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_concurrent_double_submit_ends_in_409(session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    lease = await warning_lease(session)
    await submit_appeal(session, lease_id=lease.id, justification="Release", now=NOW)

    async def no_pending_seen(*_args: object) -> bool:  # the other request has not committed yet
        return False

    monkeypatch.setattr(appeal_service, "_has_pending_appeal", no_pending_seen)
    with pytest.raises(ServiceError) as error:
        await submit_appeal(session, lease_id=lease.id, justification="Release again", now=NOW)

    assert (error.value.status_code, error.value.detail) == (409, "This lease already has a pending appeal")


async def test_revoked_lease_has_no_days_remaining_in_overview(session: AsyncSession) -> None:
    lease = await warning_lease(session, is_active=False)
    appeal = await submit_appeal(session, lease_id=lease.id, justification="Back on the project", now=NOW)

    (overview,) = await build_appeal_overviews(session, [appeal], NOW)

    assert (overview.lease_is_active, overview.days_remaining) == (False, None)


def test_days_remaining_is_zero_on_the_day_of_expiry() -> None:
    assert days_remaining(NOW - timedelta(hours=3), NOW) == 0
    assert days_remaining(NOW - timedelta(days=1, hours=3), NOW) == -1


def test_acting_admin_defaults_to_the_seeded_admin() -> None:
    assert Settings().admin_login == ADMIN_LOGIN


async def test_temporary_adapter_refuses_to_demote_an_admin(session: AsyncSession) -> None:
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    repo = await make_repo(session, "core-api")
    lease = await make_lease(session, admin, repo, Role.ADMIN, granted_at=NOW, expires_at=None)
    adapter = DatabaseVCSAdapter(session, TimeProvider(base_time_source=lambda: NOW))

    with pytest.raises(ServiceError) as error:
        await adapter.set_permission("longtails", "core-api", "tomasz-admin", Role.READ)

    assert error.value.status_code == 409
    assert (lease.current_role, lease.expires_at) == (Role.ADMIN, None)
