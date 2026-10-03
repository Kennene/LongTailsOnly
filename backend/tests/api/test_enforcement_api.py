from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_provider import TimeProvider, get_time_provider
from app.domain.enums import Role
from app.main import app
from app.models import Lease
from tests.factories import make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
DAY = timedelta(days=1)
URL = "/api/v1/enforcement/mode"


@pytest.fixture
def clock() -> Iterator[TimeProvider]:
    fixed = TimeProvider(base_time_source=lambda: NOW)
    app.dependency_overrides[get_time_provider] = lambda: fixed
    yield fixed
    app.dependency_overrides.pop(get_time_provider, None)


async def world(session: AsyncSession) -> tuple[int, int]:
    """An expired idle lease (revoked by auto at once) and one expiring in 10 days (revoked after +15)."""
    await make_user(session, "tomasz-admin", team=None, is_admin=True)
    kamil = await make_user(session, "kamil")
    expired = await make_lease(session, kamil, await make_repo(session, "docs"), Role.WRITE,
                               granted_at=NOW - 90 * DAY, expires_at=NOW - DAY)
    later = await make_lease(session, kamil, await make_repo(session, "core-api"), Role.WRITE,
                             granted_at=NOW - 20 * DAY, expires_at=NOW + 10 * DAY)
    await session.commit()
    return expired.id, later.id


async def active(session: AsyncSession, lease_id: int) -> bool:
    session.expire_all()
    return bool(await session.scalar(select(Lease.is_active).where(Lease.id == lease_id)))


async def test_default_mode_is_warning(client: AsyncClient) -> None:
    assert (await client.get(URL)).json() == {"mode": "warning"}


async def test_unknown_mode_is_rejected(client: AsyncClient, session: AsyncSession) -> None:
    await world(session)
    assert (await client.put(URL, json={"mode": "panic"})).status_code == 422


async def test_switching_to_auto_enforces_at_once(client: AsyncClient, session: AsyncSession, clock) -> None:
    expired, later = await world(session)

    r = await client.put(URL, json={"mode": "auto"})

    assert (r.status_code, r.json()) == (200, {"mode": "auto"})
    assert (await active(session, expired), await active(session, later)) == (False, True)
    audit = (await client.get("/api/v1/audit")).json()
    assert {"ENFORCEMENT_MODE_CHANGED", "LEASE_REVOKED"} <= {entry["action"] for entry in audit}


async def test_time_travel_in_auto_mode_enforces(client: AsyncClient, session: AsyncSession, clock) -> None:
    _, later = await world(session)
    await client.put(URL, json={"mode": "auto"})

    r = await client.post("/api/v1/simulation/time-travel", json={"days": 15})

    assert r.status_code == 200
    assert await active(session, later) is False


async def test_time_travel_in_warning_mode_only_moves_the_clock(client: AsyncClient, session: AsyncSession,
                                                               clock) -> None:
    expired, later = await world(session)
    await client.post("/api/v1/simulation/time-travel", json={"days": 15})
    assert (await active(session, expired), await active(session, later)) == (True, True)


async def test_demo_reset_restores_warning(client: AsyncClient, clock) -> None:
    await client.put(URL, json={"mode": "disabled"})
    assert (await client.post("/api/v1/demo/reset")).status_code == 200
    assert (await client.get(URL)).json() == {"mode": "warning"}
