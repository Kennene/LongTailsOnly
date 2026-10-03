from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.db.migrations import downgrade_to_base, upgrade_to_head
from app.domain.enums import ActorType, AuditAction
from app.models import AuditLog
from app.services.audit_service import write_audit_event

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def one_entry(session: AsyncSession) -> AuditLog:
    entry = await write_audit_event(session, now=NOW, actor_type=ActorType.SYSTEM, actor_id=None,
                                    action=AuditAction.LEASE_REVOKED, target="longtails/legacy-reports:kamil",
                                    justification="Unused")
    await session.commit()
    return entry


async def count(session: AsyncSession) -> int:
    return int(await session.scalar(select(func.count()).select_from(AuditLog)) or 0)


async def test_audit_logs_reject_orm_update(session: AsyncSession) -> None:
    entry = await one_entry(session)

    entry.justification = "tampered"
    with pytest.raises(DBAPIError, match="append-only"):
        await session.commit()
    await session.rollback()

    assert await session.scalar(select(AuditLog.justification)) == "Unused"


async def test_audit_logs_reject_raw_update_and_delete(session: AsyncSession) -> None:
    await one_entry(session)

    with pytest.raises(DBAPIError, match="append-only"):
        await session.execute(text("UPDATE audit_logs SET target = 'x'"))
    await session.rollback()
    with pytest.raises(DBAPIError, match="append-only"):
        await session.execute(text("DELETE FROM audit_logs"))
    await session.rollback()

    assert await count(session) == 1


async def test_demo_reset_still_rebuilds_schema(engine: AsyncEngine) -> None:
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await one_entry(session)

    await downgrade_to_base(engine)
    await upgrade_to_head(engine)

    async with maker() as session:
        assert await count(session) == 0
        await one_entry(session)
        with pytest.raises(DBAPIError, match="append-only"):
            await session.execute(text("DELETE FROM audit_logs"))
