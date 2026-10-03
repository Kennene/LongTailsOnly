from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.audit_service as audit_service
from app.domain.enums import ActorType, AuditAction
from app.services.audit_service import lease_target, list_audit_entries, write_audit_event
from app.services.errors import ServiceError
from tests.factories import make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def seed_audit(session: AsyncSession) -> dict[str, int]:
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    marta = await make_user(session, "marta", team="qa")
    rows = [
        (0, ActorType.SYSTEM, None, AuditAction.LEASE_REVOKED, "longtails/legacy-reports:kamil"),
        (1, ActorType.ADMIN, admin.id, AuditAction.LEASE_EXTENDED, "longtails/qa-automation:marta"),
        (2, ActorType.USER, marta.id, AuditAction.APPEAL_SUBMITTED, "longtails/qa-automation:marta"),
        (3, ActorType.ADMIN, admin.id, AuditAction.BASELINE_APPLIED, "dev:new_dev"),
        (4, ActorType.ADMIN, admin.id, AuditAction.BASELINE_APPLIED, "dev:newXdev"),
    ]
    for hours, actor_type, actor_id, action, target in rows:
        await write_audit_event(session, now=NOW + timedelta(hours=hours), actor_type=actor_type,
                                actor_id=actor_id, action=action, target=target)
    return {"admin": admin.id, "marta": marta.id}


async def targets(session: AsyncSession, **filters: object) -> list[str]:
    return [entry.target for entry in await list_audit_entries(session, **filters)]  # type: ignore[arg-type]


async def test_write_audit_event_records_who_what_why(session: AsyncSession) -> None:
    entry = await write_audit_event(
        session, now=NOW, actor_type=ActorType.ADMIN, actor_id=7, action=AuditAction.LEASE_EXTENDED,
        target="longtails/core-api:kamil", details={"preset_days": 14}, justification="Release v2.1",
    )

    assert entry.id is not None
    assert (entry.timestamp, entry.actor_type, entry.actor_id) == (NOW, ActorType.ADMIN, 7)
    assert (entry.action, entry.details, entry.justification) == ("LEASE_EXTENDED", {"preset_days": 14},
                                                                   "Release v2.1")


async def test_list_is_newest_first_with_actor_login(session: AsyncSession) -> None:
    await seed_audit(session)

    entries = await list_audit_entries(session)

    assert [entry.target for entry in entries] == [
        "dev:newXdev", "dev:new_dev", "longtails/qa-automation:marta", "longtails/qa-automation:marta",
        "longtails/legacy-reports:kamil",
    ]
    assert [entry.actor_login for entry in entries] == ["tomasz-admin", "tomasz-admin", "marta", "tomasz-admin", None]


async def test_same_timestamp_is_ordered_by_newest_id(session: AsyncSession) -> None:
    for target in ("first", "second"):
        await write_audit_event(session, now=NOW, actor_type=ActorType.SYSTEM, actor_id=None,
                                action=AuditAction.LEASE_REVOKED, target=target)

    assert await targets(session) == ["second", "first"]


async def test_filters_by_actor_type_action_and_login(session: AsyncSession) -> None:
    await seed_audit(session)

    assert await targets(session, actor_type=ActorType.SYSTEM) == ["longtails/legacy-reports:kamil"]
    assert await targets(session, action=AuditAction.LEASE_EXTENDED) == ["longtails/qa-automation:marta"]
    assert await targets(session, actor_login="marta") == ["longtails/qa-automation:marta"]


async def test_target_filter_is_case_insensitive_and_literal(session: AsyncSession) -> None:
    await seed_audit(session)

    assert len(await targets(session, target="QA-AUTOMATION")) == 2
    assert await targets(session, target="w_d") == ["dev:new_dev"]


async def test_time_range_is_inclusive_and_limit_keeps_newest(session: AsyncSession) -> None:
    await seed_audit(session)

    in_range = await targets(session, since=NOW + timedelta(hours=1), until=NOW + timedelta(hours=2))

    assert in_range == ["longtails/qa-automation:marta", "longtails/qa-automation:marta"]
    assert await targets(session, limit=2) == ["dev:newXdev", "dev:new_dev"]


async def test_since_after_until_is_rejected(session: AsyncSession) -> None:
    with pytest.raises(ServiceError) as error:
        await list_audit_entries(session, since=NOW, until=NOW - timedelta(seconds=1))

    assert error.value.status_code == 422


def test_lease_target_format() -> None:
    assert lease_target("longtails", "core-api", "kamil") == "longtails/core-api:kamil"


def test_audit_service_exposes_no_way_to_change_history() -> None:
    public = {name for name in dir(audit_service) if not name.startswith("_")}

    assert not {name for name in public if name.startswith(("update", "delete", "remove", "edit"))}
