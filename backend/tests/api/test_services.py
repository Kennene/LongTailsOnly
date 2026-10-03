from httpx import AsyncClient

from app.main import app


def test_no_operation_exposes_service_id_as_a_request_parameter() -> None:
    """The picked service is client state, never a query parameter (ADR 0014 decision 3).

    FastAPI promotes a dependency's scalar parameters into every operation that depends on it, so
    a `service_id` argument on `get_vcs_provider` leaks an undocumented, unpinned parameter onto
    mutating endpoints (Ruling 36). The resolver takes the id explicitly instead.
    """
    offenders = {
        f"{method.upper()} {path}": [
            parameter["name"] for parameter in operation.get("parameters", [])
        ]
        for path, item in app.openapi()["paths"].items()
        for method, operation in item.items()
        if any(
            parameter["name"] == "service_id" for parameter in operation.get("parameters", [])
        )
    }
    assert offenders == {}


async def test_services_catalog_returns_github_and_demo(client: AsyncClient) -> None:
    response = await client.get("/api/v1/services")
    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == ["demo-tracker", "github"]


async def test_github_entry_carries_vcs_kind_and_six_capabilities(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/services")).json()
    github = next(item for item in body if item["id"] == "github")
    assert github["kind"] == "vcs"
    assert github["is_available"] is True
    assert sorted(github["capabilities"]) == [
        "appeals", "audit", "baseline", "dashboard", "graph", "leases",
    ]


async def test_capabilities_are_normalised_to_sorted_order(client: AsyncClient) -> None:
    """Declaration order carries no meaning, so the payload does not carry it either (Ruling 38).

    Nothing consumes the order — the frontend treats the value as a set and the backend tests
    normalise it — while a reordered registry tuple used to change the payload silently.
    """
    body = (await client.get("/api/v1/services")).json()
    github = next(item for item in body if item["id"] == "github")
    assert github["capabilities"] == [
        "appeals", "audit", "baseline", "dashboard", "graph", "leases",
    ]


async def test_demo_tracker_entry_is_marked_unavailable(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/services")).json()
    demo = next(item for item in body if item["id"] == "demo-tracker")
    assert demo["is_available"] is False
    assert demo["kind"] == "issue_tracker"


async def test_catalog_order_is_deterministic(client: AsyncClient) -> None:
    first_response = await client.get("/api/v1/services")
    second_response = await client.get("/api/v1/services")
    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.json() == second_response.json()
