from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.db.activity_extras import seed_activity_extras
from app.db.migrations import downgrade_to_base
from app.db.seed import seed_demo_data, table_counts
from app.db.session import init_db
from app.ports.clock import ClockPort


async def prepare_database(target: AsyncEngine, clock: ClockPort, *, reset: bool = False) -> dict[str, int]:
    """Migrate the schema and load demo data; with reset=True start from an empty database."""
    if reset:
        await downgrade_to_base(target)
    await init_db(target)  # alembic upgrade head
    async with async_sessionmaker(target, expire_on_commit=False)() as session:
        await seed_demo_data(session, clock)
        await seed_activity_extras(session, clock)
        return await table_counts(session)
