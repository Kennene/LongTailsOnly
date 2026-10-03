from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.enforcement_mode import enforcement_state
from app.db.session import build_engine, get_engine, get_session, init_db
from app.main import app


@pytest.fixture(autouse=True)
def default_enforcement_mode() -> None:
    """The enforcement mode lives in process memory; every test starts in the default `warning`."""
    enforcement_state.reset()


@pytest.fixture
async def engine(tmp_path: Path) -> AsyncIterator[AsyncEngine]:
    test_engine = build_engine(f"sqlite+aiosqlite:///{(tmp_path / 'test.db').as_posix()}")
    await init_db(test_engine)
    yield test_engine
    await test_engine.dispose()


@pytest.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with async_sessionmaker(engine, expire_on_commit=False)() as db_session:
        yield db_session


@pytest.fixture
async def client(engine: AsyncEngine) -> AsyncIterator[AsyncClient]:
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with maker() as db_session:
            yield db_session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_engine] = lambda: engine
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
    app.dependency_overrides.clear()
