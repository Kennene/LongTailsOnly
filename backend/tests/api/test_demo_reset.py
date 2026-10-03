from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.time_provider import TimeProvider, get_time_provider
from app.main import app
from app.models import Lease, Repository, User

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


@pytest.fixture
def clock() -> Iterator[TimeProvider]:
    fixed = TimeProvider(base_time_source=lambda: NOW)
    app.dependency_overrides[get_time_provider] = lambda: fixed
    yield fixed


async def test_reset_restores_seed_and_clock(client: AsyncClient, clock: TimeProvider,
                                             session: AsyncSession) -> None:
    first = await client.post("/api/v1/demo/reset")
    assert first.status_code == 200
    assert first.json()["counts"]["users"] == 19

    session.add(User(login="intruz", name="Intruz", is_admin=False))
    await session.commit()
    clock.advance(35)

    second = await client.post("/api/v1/demo/reset")
    body = second.json()
    assert second.status_code == 200
    assert body["offset_days"] == 0
    assert datetime.fromisoformat(body["now"]) == NOW
    assert body["counts"] == first.json()["counts"]
    session.expunge_all()
    assert await session.scalar(select(User.id).where(User.login == "intruz")) is None


async def test_reset_seeds_relative_to_reset_clock(client: AsyncClient, clock: TimeProvider,
                                                   session: AsyncSession) -> None:
    clock.advance(35)
    await client.post("/api/v1/demo/reset")
    query = (select(Lease.expires_at).join(User).join(Repository)
             .where(User.login == "marta", Repository.name == "qa-automation"))
    expires_at = await session.scalar(query)
    assert expires_at is not None
    assert (expires_at - datetime(2026, 10, 3, tzinfo=UTC)).days == 3


async def test_reset_disabled_returns_404(client: AsyncClient, clock: TimeProvider) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(enable_demo_reset=False)
    response = await client.post("/api/v1/demo/reset")
    assert response.status_code == 404
