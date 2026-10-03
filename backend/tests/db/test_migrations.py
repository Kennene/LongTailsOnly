from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncEngine

from app.db.base import Base
from app.db.migrations import downgrade_to_base, upgrade_to_head


async def _tables(engine: AsyncEngine) -> set[str]:
    async with engine.connect() as conn:
        return await conn.run_sync(lambda sync: set(inspect(sync).get_table_names()))


async def test_migrations_match_models(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        diff = await conn.run_sync(
            lambda sync: compare_metadata(MigrationContext.configure(sync), Base.metadata)
        )
    assert diff == [], f"Models changed without a migration: {diff}"


async def test_schema_is_built_by_alembic(engine: AsyncEngine) -> None:
    assert "alembic_version" in await _tables(engine)


async def test_downgrade_and_upgrade_round_trip(engine: AsyncEngine) -> None:
    await downgrade_to_base(engine)
    assert await _tables(engine) <= {"alembic_version"}
    await upgrade_to_head(engine)
    assert "leases" in await _tables(engine)
