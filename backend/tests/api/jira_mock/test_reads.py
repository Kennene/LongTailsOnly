import httpx

from tests.api.jira_mock.conftest import API, acc


async def test_project_search_lists_only_jira_projects_with_jira_paging(client: httpx.AsyncClient) -> None:
    r = await client.get(f"{API}/project/search")
    assert r.status_code == 200
    body = r.json()
    assert [p["key"] for p in body["values"]] == ["PAY", "QA"]  # core-api (GitHub) is not a Jira project
    assert (body["startAt"], body["total"], body["isLast"]) == (0, 2, True)
    assert {"self", "id", "key", "name", "projectTypeKey"} <= body["values"][0].keys()


async def test_project_search_paging_and_clamped_max_results(client: httpx.AsyncClient) -> None:
    first = (await client.get(f"{API}/project/search", params={"maxResults": 1})).json()
    assert len(first["values"]) == 1 and first["isLast"] is False
    second = (await client.get(f"{API}/project/search", params={"startAt": 1, "maxResults": 1})).json()
    assert second["values"][0]["key"] == "QA" and second["isLast"] is True
    big = (await client.get(f"{API}/project/search", params={"maxResults": 5000})).json()
    assert big["maxResults"] == 100


async def test_get_project_by_key_and_id(client: httpx.AsyncClient) -> None:
    by_key = (await client.get(f"{API}/project/pay")).json()
    assert by_key["key"] == "PAY"
    assert (await client.get(f"{API}/project/{by_key['id']}")).json()["key"] == "PAY"


async def test_unknown_project_and_github_repo_are_404_in_jira_format(client: httpx.AsyncClient) -> None:
    for key in ("NOPE", "core-api"):
        r = await client.get(f"{API}/project/{key}")
        assert r.status_code == 404
        assert r.json() == {"errorMessages": [f"No project could be found with key '{key}'."], "errors": {}}


async def test_jira_project_is_not_listed_as_github_repo(client: httpx.AsyncClient) -> None:
    names = {r["name"] for r in (await client.get("/api/v3/orgs/longtails/repos")).json()}
    assert names == {"core-api"}
    assert (await client.get("/api/v3/repos/longtails/PAY")).status_code == 404


async def test_roles_and_project_role_map(client: httpx.AsyncClient) -> None:
    roles = (await client.get(f"{API}/role")).json()
    assert [r["name"] for r in roles] == ["Viewer", "Member", "Administrator"]
    mapping = (await client.get(f"{API}/project/PAY/role")).json()
    assert set(mapping) == {"Viewer", "Member", "Administrator"}
    assert mapping["Member"].endswith(f"/project/{(await client.get(f'{API}/project/PAY')).json()['id']}/role/{roles[1]['id']}")


async def test_role_actors_are_active_leases_of_that_role(client: httpx.AsyncClient) -> None:
    roles = {r["name"]: r["id"] for r in (await client.get(f"{API}/role")).json()}
    member = (await client.get(f"{API}/project/PAY/role/{roles['Member']}")).json()
    assert [a["actorUser"]["accountId"] for a in member["actors"]] == [acc("dev-01")]
    assert member["actors"][0]["type"] == "atlassian-user-role-actor"
    admin = (await client.get(f"{API}/project/PAY/role/{roles['Administrator']}")).json()
    assert [a["displayName"] for a in admin["actors"]] == ["Tomasz"]
    assert (await client.get(f"{API}/project/PAY/role/99999")).status_code == 404


async def test_users_and_groups(client: httpx.AsyncClient) -> None:
    user = (await client.get(f"{API}/user", params={"accountId": acc("dev-01")})).json()
    assert user["displayName"] == "Dev One" and user["accountId"] == acc("dev-01") and user["active"] is True
    assert (await client.get(f"{API}/user", params={"accountId": "nope"})).status_code == 404
    found = (await client.get(f"{API}/user/search", params={"query": "dev"})).json()
    assert {u["displayName"] for u in found} == {"Dev One", "Dev Two"}
    groups = (await client.get(f"{API}/group/bulk")).json()
    assert {g["name"] for g in groups["values"]} == {"DEV", "QA"}
    members = (await client.get(f"{API}/group/member", params={"groupname": "QA"})).json()
    assert [u["displayName"] for u in members["values"]] == ["QA One"]
    assert (await client.get(f"{API}/group/member", params={"groupname": "X"})).status_code == 404
    assert (await client.get(f"{API}/group/member")).status_code == 400


async def test_validation_errors_use_jira_format(client: httpx.AsyncClient) -> None:
    r = await client.get(f"{API}/project/search", params={"startAt": -1})
    assert r.status_code == 400
    body = r.json()
    assert body["errorMessages"] == [] and "startAt" in body["errors"]
    assert "message" not in body  # not the GitHub format
