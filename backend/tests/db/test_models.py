from datetime import UTC, datetime

from sqlalchemy import select

from app.db.session import init_db
from app.models import ActivityEvent, Lease, Repository, User

T = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def test_init_db_creates_tables(engine) -> None:
    await init_db(engine)
    async with engine.connect() as conn:
        names = await conn.run_sync(lambda c: set(__import__("sqlalchemy").inspect(c).get_table_names()))
    assert {"users", "repositories", "leases", "activity_events"} <= names


async def test_models_persist_required_fields_and_timezone(session) -> None:
    user = User(login="dev-01", name="Dev One", team="DEV", is_admin=False)
    repo = Repository(name="core-api", owner="longtails", default_branch="main")
    session.add_all([user, repo])
    await session.flush()
    session.add_all([
        Lease(user_id=user.id, repo_id=repo.id, current_role="admin", granted_at=T, expires_at=None),
        ActivityEvent(user_id=user.id, repo_id=repo.id, timestamp=T, action_type="PushEvent", required_permission="write"),
    ])
    await session.commit()
    lease = (await session.execute(select(Lease))).scalar_one()
    event = (await session.execute(select(ActivityEvent))).scalar_one()
    assert lease.expires_at is None
    assert lease.granted_at == T and lease.granted_at.tzinfo is not None
    assert event.timestamp == T and event.required_permission == "write"
    assert repo.default_lease_duration_days == 30
