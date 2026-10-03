import httpx

API = "/api/v3"


async def test_list_org_members_returns_github_user_shape(client: httpx.AsyncClient) -> None:
    r = await client.get(f"{API}/orgs/longtails/members")
    assert r.status_code == 200
    body = r.json()
    assert {u["login"] for u in body} == {"tomasz-admin", "dev-01", "dev-02", "qa-01"}
    user = next(u for u in body if u["login"] == "dev-01")
    assert {"login", "id", "node_id", "avatar_url", "url", "type", "site_admin"} <= user.keys()
    assert user["type"] == "User"
    assert next(u for u in body if u["login"] == "tomasz-admin")["site_admin"] is False


async def test_list_teams_returns_dev_and_qa_slugs(client: httpx.AsyncClient) -> None:
    r = await client.get(f"{API}/orgs/longtails/teams")
    assert r.status_code == 200
    teams = r.json()
    assert {t["slug"] for t in teams} == {"dev", "qa"}
    assert {"id", "name", "slug", "privacy", "permission", "members_url", "repositories_url"} <= teams[0].keys()


async def test_list_team_members_filters_by_team(client: httpx.AsyncClient) -> None:
    dev = await client.get(f"{API}/orgs/longtails/teams/dev/members")
    qa = await client.get(f"{API}/orgs/longtails/teams/qa/members")
    assert {u["login"] for u in dev.json()} == {"dev-01", "dev-02"}
    assert {u["login"] for u in qa.json()} == {"qa-01"}


async def test_unknown_team_returns_github_404(client: httpx.AsyncClient) -> None:
    r = await client.get(f"{API}/orgs/longtails/teams/nope/members")
    assert r.status_code == 404
    assert r.json()["message"] == "Not Found"


async def test_list_org_repos_shape(client: httpx.AsyncClient) -> None:
    r = await client.get(f"{API}/orgs/longtails/repos")
    assert r.status_code == 200
    repos = {x["name"]: x for x in r.json()}
    assert set(repos) == {"core-api", "auth-service", "frontend-app"}
    core = repos["core-api"]
    assert core["full_name"] == "longtails/core-api"
    assert core["default_branch"] == "main"
    assert core["owner"]["login"] == "longtails"
    assert core["owner"]["type"] == "Organization"


async def test_get_single_repo_and_wrong_owner(client: httpx.AsyncClient) -> None:
    ok = await client.get(f"{API}/repos/longtails/core-api")
    assert ok.status_code == 200 and ok.json()["full_name"] == "longtails/core-api"
    assert (await client.get(f"{API}/repos/other-org/core-api")).status_code == 404
    assert (await client.get(f"{API}/repos/longtails/missing")).status_code == 404


async def test_unknown_org_returns_github_404(client: httpx.AsyncClient) -> None:
    r = await client.get(f"{API}/orgs/nope/members")
    assert r.status_code == 404
    body = r.json()
    assert body["message"] == "Not Found"
    assert body["documentation_url"].startswith("https://docs.github.com")


async def test_response_has_github_headers(client: httpx.AsyncClient) -> None:
    r = await client.get(f"{API}/orgs/longtails/members")
    assert r.headers["x-github-media-type"] == "github.v3; format=json"
    assert r.headers["x-ratelimit-limit"] == "5000"
    assert "x-ratelimit-remaining" in r.headers and "x-ratelimit-reset" in r.headers


async def test_pagination_link_header_and_bounds(client: httpx.AsyncClient) -> None:
    first = await client.get(f"{API}/orgs/longtails/members", params={"per_page": 2})
    assert len(first.json()) == 2
    assert 'rel="next"' in first.headers["link"] and 'rel="last"' in first.headers["link"]
    second = await client.get(f"{API}/orgs/longtails/members", params={"per_page": 2, "page": 2})
    assert len(second.json()) == 2
    assert 'rel="prev"' in second.headers["link"]
    beyond = await client.get(f"{API}/orgs/longtails/members", params={"per_page": 2, "page": 9})
    assert beyond.status_code == 200 and beyond.json() == []
    for bad in ({"per_page": 101}, {"per_page": 0}, {"page": 0}):
        r = await client.get(f"{API}/orgs/longtails/members", params=bad)
        assert r.status_code == 422
        assert r.json()["message"] == "Validation Failed"
        assert "documentation_url" in r.json()
