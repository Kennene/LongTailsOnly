from httpx import AsyncClient

MOCK_PREFIXES = ("/api/v3", "/rest/api/3")
HTTP_METHODS = {"get", "put", "post", "delete", "patch"}


async def test_main_docs_hide_mock_endpoints(client: AsyncClient) -> None:
    schema = (await client.get("/openapi.json")).json()

    assert not [path for path in schema["paths"] if path.startswith(MOCK_PREFIXES)]
    assert "/api/v1/leases" in schema["paths"]
    assert "/mocks/docs" in schema["info"]["description"]


async def test_mock_docs_list_every_mock_endpoint_under_a_named_group(client: AsyncClient) -> None:
    schema = (await client.get("/mocks/openapi.json")).json()

    paths = schema["paths"]
    assert paths
    assert all(path.startswith(MOCK_PREFIXES) for path in paths)
    declared_tags = {tag["name"] for tag in schema["tags"]}
    operations = [op for item in paths.values() for method, op in item.items() if method in HTTP_METHODS]
    used_tags = {tag for op in operations for tag in op.get("tags", [])}
    assert all(len(op.get("tags", [])) == 1 for op in operations)
    assert used_tags == declared_tags
    assert all(tag.startswith(("GitHub", "Jira")) for tag in declared_tags)
    assert "/docs" in schema["info"]["description"]


async def test_mock_docs_page_points_at_mock_schema(client: AsyncClient) -> None:
    response = await client.get("/mocks/docs")

    assert response.status_code == 200
    assert "/mocks/openapi.json" in response.text


async def test_mock_endpoints_still_respond_on_their_paths(client: AsyncClient) -> None:
    assert (await client.get("/api/v3/orgs/longtails/teams")).status_code != 404
    assert (await client.get("/rest/api/3/role")).status_code != 404
