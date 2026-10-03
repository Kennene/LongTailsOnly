from datetime import UTC, datetime

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.time_provider import TimeProvider, get_time_provider
from app.db.bootstrap import prepare_database
from app.main import app

BASE = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


@pytest.fixture
def clock() -> TimeProvider:
    return TimeProvider(base_time_source=lambda: BASE)


@pytest.fixture
async def demo(client: httpx.AsyncClient, engine: AsyncEngine, clock: TimeProvider) -> httpx.AsyncClient:
    """The real demo dataset (seed + extras) behind the root `client`, with a frozen clock."""
    app.dependency_overrides[get_time_provider] = lambda: clock
    await prepare_database(engine, clock)
    return client
