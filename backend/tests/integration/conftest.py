from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from app.core.config import Settings
from app.core.time_provider import TimeProvider
from app.main import create_app

BASE = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


@pytest.fixture
async def demo_app(tmp_path: Path) -> AsyncIterator[FastAPI]:
    settings = Settings(database_url=f"sqlite+aiosqlite:///{tmp_path / 'demo.db'}", seed_demo=True)
    app = create_app(settings, TimeProvider(base_clock=lambda: BASE))
    async with app.router.lifespan_context(app):
        yield app


@pytest.fixture
async def demo(demo_app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=demo_app), base_url="http://test") as c:
        yield c
