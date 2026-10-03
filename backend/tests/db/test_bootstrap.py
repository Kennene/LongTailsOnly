from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.time_provider import TimeProvider
from app.db.bootstrap import prepare_database
from app.models import User

CLOCK = TimeProvider(base_time_source=lambda: datetime(2026, 10, 3, 12, 0, tzinfo=UTC))


async def test_prepare_seeds_empty_database_once(engine: AsyncEngine) -> None:
    first = await prepare_database(engine, CLOCK)
    second = await prepare_database(engine, CLOCK)
    assert first["users"] == 19
    assert second == first


async def test_prepare_with_reset_drops_changes(engine: AsyncEngine, session: AsyncSession) -> None:
    baseline = await prepare_database(engine, CLOCK)
    session.add(User(login="intruz", name="Intruz", is_admin=False))
    await session.commit()

    assert await prepare_database(engine, CLOCK, reset=True) == baseline
