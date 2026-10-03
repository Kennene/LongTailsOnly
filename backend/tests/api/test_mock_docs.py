import pytest
from httpx import AsyncClient

GITHUB_PREFIX = "/api/v3"
JIRA_PREFIX = "/rest/api/3"
MOCK_PREFIXES = (GITHUB_PREFIX, JIRA_PREFIX)
HTTP_METHODS = {"get", "put", "post", "delete", "patch"}
MOCKS = [("github", GITHUB_PREFIX, "GitHub"), ("jira", JIRA_PREFIX, "Jira")]


async def test_main_docs_hide_mock_endpoints(client: AsyncClient) -> None:
    schema = (await client.get("/openapi.json")).json()

    assert not [path for path in schema["paths"] if path.startswith(MOCK_PREFIXES)]
    assert "/api/v1/leases" in schema["paths"]
    assert "/mocks/github/docs" in schema["info"]["description"]
    assert "/mocks/jira/docs" in schema["info"]["description"]


@pytest.mark.parametrize(("mock", "prefix", "tag_prefix"), MOCKS)
async def test_mock_docs_list_only_their_own_endpoints_under_named_groups(
    client: AsyncClient, mock: str, prefix: str, tag_prefix: str
) -> None:
    schema = (await client.get(f"/mocks/{mock}/openapi.json")).json()

    paths = schema["paths"]
    assert paths
    assert all(path.startswith(prefix) for path in paths)
    declared_tags = {tag["name"] for tag in schema["tags"]}
    operations = [op for item in paths.values() for method, op in item.items() if method in HTTP_METHODS]
    used_tags = {tag for op in operations for tag in op.get("tags", [])}
    assert all(len(op.get("tags", [])) == 1 for op in operations)
    assert used_tags == declared_tags
    assert all(tag.startswith(tag_prefix) for tag in declared_tags)
    assert "/docs" in schema["info"]["description"]


@pytest.mark.parametrize("mock", ["github", "jira"])
async def test_mock_docs_page_points_at_its_own_schema(client: AsyncClient, mock: str) -> None:
    response = await client.get(f"/mocks/{mock}/docs")

    assert response.status_code == 200
    assert f"/mocks/{mock}/openapi.json" in response.text


async def test_combined_mock_docs_page_is_gone(client: AsyncClient) -> None:
    assert (await client.get("/mocks/docs")).status_code == 404
    assert (await client.get("/mocks/openapi.json")).status_code == 404


async def test_mock_endpoints_still_respond_on_their_paths(client: AsyncClient) -> None:
    assert (await client.get("/api/v3/orgs/longtails/teams")).status_code != 404
    assert (await client.get("/rest/api/3/role")).status_code != 404
