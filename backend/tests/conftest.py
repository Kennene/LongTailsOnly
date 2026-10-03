from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.session import create_engine_and_sessionmaker


@pytest.fixture
async def engine(tmp_path: Path) -> AsyncIterator[AsyncEngine]:
    eng, _ = create_engine_and_sessionmaker(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    yield eng
    await eng.dispose()


@pytest.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    from app.db.session import init_db

    await init_db(engine)
    async with AsyncSession(engine, expire_on_commit=False) as s:
        yield s
