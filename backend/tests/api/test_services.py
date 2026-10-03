from httpx import AsyncClient


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
