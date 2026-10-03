from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import Column, Integer, MetaData, Table, insert, select
from sqlalchemy.exc import StatementError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.db.types import UTCDateTime

metadata = MetaData()
stamps = Table("stamps", metadata, Column("id", Integer, primary_key=True), Column("at", UTCDateTime()))


async def _create(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)


async def test_aware_datetime_round_trips_as_utc(engine: AsyncEngine) -> None:
    await _create(engine)
    warsaw = timezone(timedelta(hours=2))
    async with engine.begin() as conn:
        await conn.execute(insert(stamps).values(at=datetime(2026, 10, 3, 14, 0, tzinfo=warsaw)))
        stored = (await conn.execute(select(stamps.c.at))).scalar_one()
    assert stored == datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
    assert stored.tzinfo is UTC


async def test_naive_datetime_is_rejected(engine: AsyncEngine) -> None:
    await _create(engine)
    async with engine.begin() as conn:
        with pytest.raises(StatementError, match="timezone"):
            await conn.execute(insert(stamps).values(at=datetime(2026, 10, 3, 12, 0)))
