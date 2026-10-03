"""Shared data for step 4.6 service and API tests (statuses follow ADR 0002 unambiguously)."""

from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType, AppealStatus, Role
from app.models import Appeal
from tests.factories import make_event, make_lease, make_repo, make_user


async def build_insights_world(session: AsyncSession, now: datetime) -> None:
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    kamil = await make_user(session, "kamil")
    anna = await make_user(session, "ania")
    jan = await make_user(session, "jan")
    await make_user(session, "nowy-dev")
    marta = await make_user(session, "marta", team="qa")
    core, payment = await make_repo(session, "core-api"), await make_repo(session, "payment-service")
    legacy, qa = await make_repo(session, "legacy-reports"), await make_repo(session, "qa-automation")

    await make_lease(session, admin, core, Role.ADMIN, granted_at=now, expires_at=None)
    warning = await make_lease(session, kamil, payment, Role.WRITE, granted_at=now - timedelta(days=25),
                               expires_at=now + timedelta(days=5))
    await make_event(session, kamil, payment, ActionType.PR_REVIEW, now - timedelta(days=3))       # DOWNSCOPE
    await make_lease(session, anna, core, Role.WRITE, granted_at=now - timedelta(days=5),
                     expires_at=now + timedelta(days=25))
    await make_event(session, anna, core, ActionType.PUSH, now - timedelta(days=5))                # KEEP
    await make_lease(session, jan, legacy, Role.WRITE, granted_at=now - timedelta(days=45),
                     expires_at=now - timedelta(days=15))                                           # REVOKE
    await make_lease(session, marta, qa, Role.READ, granted_at=now - timedelta(days=40),
                     expires_at=now - timedelta(days=10), is_active=False)                          # revoked
    session.add(Appeal(lease=warning, user_id=kamil.id, repo_id=payment.id, requested_role=Role.WRITE,
                       justification="Release v2.1", status=AppealStatus.PENDING, created_at=now))
    await session.commit()
