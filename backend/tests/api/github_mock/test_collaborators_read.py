import httpx

API = "/api/v3/repos/longtails/core-api/collaborators"


async def test_list_collaborators_includes_permissions_and_role_name(client: httpx.AsyncClient) -> None:
    r = await client.get(API)
    assert r.status_code == 200
    by_login = {c["login"]: c for c in r.json()}
    assert set(by_login) == {"tomasz-admin", "dev-01", "dev-02"}
    assert by_login["tomasz-admin"]["role_name"] == "admin"
    assert by_login["tomasz-admin"]["permissions"] == dict(admin=True, maintain=True, push=True, triage=True, pull=True)
    assert by_login["dev-01"]["role_name"] == "write"
    assert by_login["dev-01"]["permissions"]["push"] is True and by_login["dev-01"]["permissions"]["admin"] is False
    assert by_login["dev-02"]["role_name"] == "read"
    assert by_login["dev-02"]["permissions"] == dict(admin=False, maintain=False, push=False, triage=False, pull=True)


async def test_get_permission_for_user(client: httpx.AsyncClient) -> None:
    r = await client.get(f"{API}/dev-01/permission")
    assert r.status_code == 200
    body = r.json()
    assert body["permission"] == "write" and body["role_name"] == "write"
    assert body["user"]["login"] == "dev-01"
    assert body["user"]["permissions"]["push"] is True


async def test_get_permission_for_non_collaborator_is_none(client: httpx.AsyncClient) -> None:
    r = await client.get(f"{API}/qa-01/permission")  # org member, no access to core-api
    assert r.status_code == 200
    body = r.json()
    assert body["permission"] == "none" and body["role_name"] == "none"
    assert body["user"]["permissions"] == dict(admin=False, maintain=False, push=False, triage=False, pull=False)


async def test_get_permission_for_unknown_user_returns_404(client: httpx.AsyncClient) -> None:
    r = await client.get(f"{API}/ghost/permission")
    assert r.status_code == 404 and r.json()["message"] == "Not Found"


async def test_collaborators_unknown_repo_returns_404(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v3/repos/longtails/nope/collaborators")).status_code == 404


async def test_collaborators_paginated(client: httpx.AsyncClient) -> None:
    r = await client.get(API, params={"per_page": 2})
    assert len(r.json()) == 2 and 'rel="next"' in r.headers["link"]
