from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


def build_engine(url: str) -> AsyncEngine:
    new_engine = create_async_engine(url)

    @event.listens_for(new_engine.sync_engine, "connect")
    def _enable_foreign_keys(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return new_engine


engine = build_engine(settings.database_url)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


def get_engine() -> AsyncEngine:
    return engine


async def init_db(target: AsyncEngine | None = None) -> None:
    """Build the schema from Alembic migrations only (ADR 0007, point 9)."""
    from app.db.migrations import upgrade_to_head

    await upgrade_to_head(target or engine)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
