from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActorType, AuditAction
from app.services.audit_service import write_audit_event
from tests.factories import make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def seed(session: AsyncSession) -> None:
    marta = await make_user(session, "marta", team="qa")
    await write_audit_event(session, now=NOW, actor_type=ActorType.SYSTEM, actor_id=None,
                            action=AuditAction.LEASE_REVOKED, target="longtails/legacy-reports:kamil",
                            details={"reason": "expired"}, justification="Automatic enforcement")
    await write_audit_event(session, now=NOW + timedelta(hours=1), actor_type=ActorType.USER, actor_id=marta.id,
                            action=AuditAction.APPEAL_SUBMITTED, target="longtails/qa-automation:marta",
                            justification="Release v2.1")
    await session.commit()


async def test_audit_returns_entries_newest_first(client: AsyncClient, session: AsyncSession) -> None:
    await seed(session)

    body = (await client.get("/api/v1/audit")).json()

    assert [entry["action"] for entry in body] == ["APPEAL_SUBMITTED", "LEASE_REVOKED"]
    assert body[0]["actor_login"] == "marta"
    assert body[1]["details"] == {"reason": "expired"}
    assert set(body[0]) == {"id", "timestamp", "actor_type", "actor_id", "actor_login", "action", "target",
                            "details", "justification"}


async def test_audit_filters(client: AsyncClient, session: AsyncSession) -> None:
    await seed(session)

    system = (await client.get("/api/v1/audit", params={"actor_type": "SYSTEM"})).json()
    by_login = (await client.get("/api/v1/audit", params={"actor_login": "marta"})).json()
    by_target = (await client.get("/api/v1/audit", params={"target": "QA-AUTOMATION"})).json()
    by_action = (await client.get("/api/v1/audit", params={"action": "LEASE_REVOKED"})).json()
    by_time = (await client.get("/api/v1/audit", params={"since": "2026-10-03T12:30:00Z",
                                                         "until": "2026-10-03T14:00:00Z"})).json()

    assert [entry["target"] for entry in system] == ["longtails/legacy-reports:kamil"]
    assert [entry["action"] for entry in by_login] == ["APPEAL_SUBMITTED"]
    assert [entry["actor_login"] for entry in by_target] == ["marta"]
    assert [entry["actor_type"] for entry in by_action] == ["SYSTEM"]
    assert [entry["action"] for entry in by_time] == ["APPEAL_SUBMITTED"]


async def test_invalid_audit_filters_return_422(client: AsyncClient) -> None:
    reversed_range = await client.get("/api/v1/audit", params={"since": "2026-10-04T00:00:00Z",
                                                               "until": "2026-10-03T00:00:00Z"})
    bad_enum = await client.get("/api/v1/audit", params={"actor_type": "ROBOT"})
    bad_limit = await client.get("/api/v1/audit", params={"limit": 0})
    naive_date = await client.get("/api/v1/audit", params={"since": "2026-10-03T00:00:00"})

    assert (reversed_range.status_code, reversed_range.json()) == (
        422, {"detail": "'since' must not be later than 'until'"})
    assert (bad_enum.status_code, bad_limit.status_code, naive_date.status_code) == (422, 422, 422)
