from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.domain.enums import ActionType, ActorType, AppealStatus, Role
from app.models import ActivityEvent, Appeal, AuditLog, Lease, Repository, Team, User

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
TABLES = {"teams", "users", "repositories", "leases", "activity_events", "appeals", "audit_logs"}


async def _people(session: AsyncSession) -> tuple[User, Repository]:
    team = Team(slug="dev", name="DEV")
    user = User(login="kamil", name="Kamil", team=team, is_admin=False)
    repo = Repository(name="core-api", owner="longtails", default_branch="main")
    session.add_all([team, user, repo])
    await session.flush()
    return user, repo


async def test_init_db_creates_tables(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        names = await conn.run_sync(lambda sync: set(inspect(sync).get_table_names()))
    assert TABLES <= names


async def test_models_persist_required_fields(session: AsyncSession) -> None:
    user, repo = await _people(session)
    lease = Lease(user=user, repository=repo, current_role=Role.WRITE,
                  granted_at=NOW - timedelta(days=10), expires_at=NOW + timedelta(days=20))
    admin_lease = Lease(user=User(login="tomasz-admin", name="Tomasz", is_admin=True),
                        repository=repo, current_role=Role.ADMIN, granted_at=NOW, expires_at=None)
    session.add_all([
        lease, admin_lease,
        ActivityEvent(user=user, repository=repo, timestamp=NOW, action_type=ActionType.PUSH,
                      required_permission=Role.WRITE),
        Appeal(lease=lease, user_id=user.id, repo_id=repo.id, requested_role=Role.WRITE,
               justification="Release v2.1", status=AppealStatus.PENDING, created_at=NOW),
        AuditLog(timestamp=NOW, actor_type=ActorType.SYSTEM, action="LEASE_WARNING",
                 target="kamil/core-api", details={"days_remaining": 7}),
    ])
    await session.commit()
    session.expunge_all()

    stored = (await session.execute(select(Lease).where(Lease.current_role == Role.WRITE))).scalar_one()
    assert stored.user.login == "kamil"
    assert stored.user.team is not None and stored.user.team.slug == "dev"
    assert stored.repository.default_lease_duration_days == 30
    assert stored.is_active is True
    assert stored.expires_at == NOW + timedelta(days=20)
    assert stored.expires_at.tzinfo is UTC

    admin = (await session.execute(select(Lease).where(Lease.current_role == Role.ADMIN))).scalar_one()
    assert admin.expires_at is None

    event = (await session.execute(select(ActivityEvent))).scalar_one()
    assert (event.action_type, event.required_permission) == (ActionType.PUSH, Role.WRITE)

    appeal = (await session.execute(select(Appeal))).scalar_one()
    assert appeal.status is AppealStatus.PENDING and appeal.resolved_at is None

    audit = (await session.execute(select(AuditLog))).scalar_one()
    assert audit.actor_id is None and audit.details == {"days_remaining": 7}


async def test_lease_is_unique_per_user_and_repo(session: AsyncSession) -> None:
    user, repo = await _people(session)
    session.add_all([
        Lease(user=user, repository=repo, current_role=Role.WRITE, granted_at=NOW, expires_at=NOW),
        Lease(user=user, repository=repo, current_role=Role.READ, granted_at=NOW, expires_at=NOW),
    ])
    with pytest.raises(IntegrityError):
        await session.commit()


async def test_foreign_keys_are_enforced(session: AsyncSession) -> None:
    session.add(ActivityEvent(user_id=999, repo_id=999, timestamp=NOW,
                              action_type=ActionType.PUSH, required_permission=Role.WRITE))
    with pytest.raises(IntegrityError):
        await session.commit()
