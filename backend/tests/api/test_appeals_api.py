from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_provider import TimeProvider, get_time_provider
from app.domain.enums import Role
from app.main import app
from tests.factories import make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def fixed_clock() -> Iterator[None]:
    app.dependency_overrides[get_time_provider] = lambda: TimeProvider(base_time_source=lambda: NOW)
    yield


async def appeal_world(session: AsyncSession) -> dict[str, int]:
    await make_user(session, "tomasz-admin", team=None, is_admin=True)
    marta = await make_user(session, "marta", team="qa")
    anna = await make_user(session, "ania")
    repo = await make_repo(session, "qa-automation")
    warning = await make_lease(session, marta, repo, Role.READ, granted_at=NOW - timedelta(days=27),
                               expires_at=NOW + timedelta(days=3))
    active = await make_lease(session, anna, repo, Role.WRITE, granted_at=NOW, expires_at=NOW + timedelta(days=30))
    await session.commit()
    return {"warning": warning.id, "active": active.id}


async def submit(client: AsyncClient, lease_id: int, justification: str = "Release v2.1") -> dict:
    return (await client.post("/api/v1/appeals", json={"lease_id": lease_id, "justification": justification})).json()


async def test_submit_returns_ready_overview(client: AsyncClient, session: AsyncSession) -> None:
    ids = await appeal_world(session)

    response = await client.post("/api/v1/appeals", json={"lease_id": ids["warning"], "justification": "Release"})

    assert response.status_code == 201
    body = response.json()
    assert (body["status"], body["days_remaining"], body["lease_role"], body["lease_is_active"]) == (
        "PENDING", 3, "read", True)
    assert (body["user"]["login"], body["repository"]["name"], body["previous_appeals"]) == (
        "marta", "qa-automation", 0)


async def test_empty_or_missing_justification_is_422(client: AsyncClient, session: AsyncSession) -> None:
    ids = await appeal_world(session)

    empty = await client.post("/api/v1/appeals", json={"lease_id": ids["warning"], "justification": "   "})
    missing = await client.post("/api/v1/appeals", json={"lease_id": ids["warning"]})

    assert (empty.status_code, missing.status_code) == (422, 422)


async def test_repeated_justification_is_422_with_reason(client: AsyncClient, session: AsyncSession) -> None:
    ids = await appeal_world(session)
    first = await submit(client, ids["warning"], "Release v2.1")
    await client.post(f"/api/v1/appeals/{first['id']}/reject", json={"justification": "No"})

    repeated = await client.post("/api/v1/appeals", json={"lease_id": ids["warning"], "justification": " release V2.1"})

    assert (repeated.status_code, repeated.json()) == (
        422, {"detail": "Justification must be new; previous justifications cannot be reused"})


async def test_wrong_state_duplicate_and_unknown_lease(client: AsyncClient, session: AsyncSession) -> None:
    ids = await appeal_world(session)

    active = await client.post("/api/v1/appeals", json={"lease_id": ids["active"], "justification": "Just in case"})
    unknown = await client.post("/api/v1/appeals", json={"lease_id": 9999, "justification": "Release"})
    await submit(client, ids["warning"])
    duplicate = await client.post("/api/v1/appeals", json={"lease_id": ids["warning"], "justification": "Other"})

    assert active.status_code == 409
    assert (unknown.status_code, unknown.json()) == (404, {"detail": "Lease 9999 not found"})
    assert (duplicate.status_code, duplicate.json()) == (409, {"detail": "This lease already has a pending appeal"})


async def test_reject_appeal(client: AsyncClient, session: AsyncSession) -> None:
    ids = await appeal_world(session)
    appeal = await submit(client, ids["warning"])

    rejected = await client.post(f"/api/v1/appeals/{appeal['id']}/reject", json={"justification": "No business need"})
    again = await client.post(f"/api/v1/appeals/{appeal['id']}/reject", json={"justification": "Still no"})
    blank = await client.post(f"/api/v1/appeals/{appeal['id']}/reject", json={"justification": " "})
    audit = (await client.get("/api/v1/audit", params={"action": "APPEAL_REJECTED"})).json()

    assert (rejected.status_code, rejected.json()["status"]) == (200, "REJECTED")
    assert rejected.json()["resolved_at"] is not None
    assert (again.status_code, blank.status_code) == (409, 422)
    assert [(entry["actor_login"], entry["justification"]) for entry in audit] == [("tomasz-admin", "No business need")]


async def test_history_endpoint_filters(client: AsyncClient, session: AsyncSession) -> None:
    ids = await appeal_world(session)
    mine = await submit(client, ids["warning"], "Release v2.1")

    by_login = (await client.get("/api/v1/appeals", params={"login": "marta"})).json()
    pending = (await client.get("/api/v1/appeals", params={"lease_id": ids["warning"], "status": "PENDING"})).json()
    nobody = (await client.get("/api/v1/appeals", params={"login": "ania"})).json()

    assert [item["id"] for item in by_login] == [mine["id"]]
    assert [item["justification"] for item in pending] == ["Release v2.1"]
    assert nobody == []


async def test_history_endpoint_errors(client: AsyncClient, session: AsyncSession) -> None:
    await appeal_world(session)

    unknown = await client.get("/api/v1/appeals", params={"login": "ghost"})
    bad_status = await client.get("/api/v1/appeals", params={"status": "OPEN"})

    assert (unknown.status_code, unknown.json()) == (404, {"detail": "User ghost not found"})
    assert bad_status.status_code == 422


async def test_decide_appeal_extends_lease_and_approves(client: AsyncClient, session: AsyncSession) -> None:
    ids = await appeal_world(session)
    appeal = await submit(client, ids["warning"])

    decided = await client.post(f"/api/v1/appeals/{appeal['id']}/decision",
                                json={"action": "EXTEND", "extension": {"preset_days": 14},
                                      "justification": "Release v2.1"})
    again = await client.post(f"/api/v1/appeals/{appeal['id']}/decision", json={"action": "REVOKE"})

    assert decided.status_code == 200
    assert decided.json()["status"] == "APPROVED"
    assert decided.json()["days_remaining"] > 3
    assert again.status_code == 409


async def test_lease_decision_is_routed_through_pending_appeal(client: AsyncClient, session: AsyncSession) -> None:
    ids = await appeal_world(session)
    appeal = await submit(client, ids["warning"])

    blocked = await client.post(f"/api/v1/leases/{ids['warning']}/decision",
                                json={"action": "EXTEND", "extension": {"preset_days": 7}})
    via_appeal = await client.post(f"/api/v1/appeals/{appeal['id']}/decision",
                                   json={"action": "REVOKE", "justification": "Not needed any more"})

    assert blocked.status_code == 409
    assert (via_appeal.status_code, via_appeal.json()["status"], via_appeal.json()["lease_is_active"]) == (
        200, "REJECTED", False)
