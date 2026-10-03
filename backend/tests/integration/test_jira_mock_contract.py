"""End-to-end contract of the Jira mock with the seeded demo (scenarios E-H, ADR 0011).

Like the GitHub contract test, the status oracle is a literal transcription of ADR 0002 (TTL 30 days,
warning window 7 days, write evidence renews write+read, read evidence renews only read). It is NOT
the lease engine; swap it for `lease_service` when that exists. Write evidence = status changes
(changelog), read evidence = comments; both come only from the public Jira endpoints.
"""
from datetime import UTC, datetime

import httpx

from app.domain.enums import Role
from app.domain.jira_roles import role_for

API = "/rest/api/3"
SIM = "/api/v1/simulation/time-travel"
TTL, WARN = 30, 7
PROJECTS = ("PAY", "CORE", "AUTH", "QA", "OPS")
DEVS = ("ania", "bartek", "celina", "darek", "ewa", "filip", "gosia", "henryk", "iza", "jan")


def ts(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.000+0000").replace(tzinfo=UTC)


async def account(client: httpx.AsyncClient, login: str) -> str:
    users = (await client.get(f"{API}/user/search", params={"query": login, "maxResults": 100})).json()
    return next(u["accountId"] for u in users if u["emailAddress"] == f"{login}@longtails.example")


async def role_of(client: httpx.AsyncClient, project: str, acc: str) -> Role | None:
    for role in Role:
        actors = (await client.get(f"{API}/project/{project}/role/{role_for(role).id}")).json()["actors"]
        if acc in {a["actorUser"]["accountId"] for a in actors}:
            return role
    return None


def status_for(newest: datetime | None, now: datetime) -> str:
    if newest is None:
        return "EXPIRED"
    remaining = TTL - (now - newest).total_seconds() / 86400
    return "EXPIRED" if remaining <= 0 else "WARNING" if remaining <= WARN else "ACTIVE"


async def evidence(client: httpx.AsyncClient, project: str, acc: str) -> tuple[list[datetime], list[datetime]]:
    """(status changes, comments) authored by `acc` in the project, read through Jira endpoints only."""
    found = (await client.get(f"{API}/search/jql", params={"jql": f"project = {project} AND updated >= -365d", "maxResults": 100})).json()
    changes: list[datetime] = []
    comments: list[datetime] = []
    for issue in found["issues"]:
        log = (await client.get(f"{API}/issue/{issue['key']}/changelog", params={"maxResults": 100})).json()
        changes += [ts(e["created"]) for e in log["values"] if e["author"]["accountId"] == acc]
        notes = (await client.get(f"{API}/issue/{issue['key']}/comment", params={"maxResults": 100})).json()
        comments += [ts(c["created"]) for c in notes["comments"] if c["author"]["accountId"] == acc]
    return changes, comments


async def oracle(client: httpx.AsyncClient, project: str, login: str) -> str:
    clock = (await client.get(SIM)).json()["now"]
    now = datetime.fromisoformat(clock).astimezone(UTC)
    acc = await account(client, login)
    role = await role_of(client, project, acc)
    if role is Role.ADMIN:
        return "PERMANENT"
    assert role is not None, f"{login} has no role in {project}"
    changes, comments = await evidence(client, project, acc)
    newest = lambda times: max(times) if times else None  # noqa: E731
    if role is Role.WRITE:
        state = status_for(newest(changes), now)
        if state != "EXPIRED":
            return state
        return "DOWNSCOPE" if status_for(newest(comments), now) != "EXPIRED" else "REVOKE"
    state = status_for(newest(changes + comments), now)
    return "REVOKE" if state == "EXPIRED" else state


async def jump_to(client: httpx.AsyncClient, days: int) -> None:
    await client.delete(SIM)
    if days:
        await client.post(SIM, json={"days": days})


async def test_projects_and_membership_come_from_seed(demo: httpx.AsyncClient) -> None:
    found = (await demo.get(f"{API}/project/search", params={"maxResults": 100})).json()
    assert [p["key"] for p in found["values"]] == list(PROJECTS)
    github = {r["name"] for r in (await demo.get("/api/v3/orgs/longtails/repos", params={"per_page": 100})).json()}
    assert len(github) == 10 and not github & set(PROJECTS)  # providers do not mix
    groups = {g["name"] for g in (await demo.get(f"{API}/group/bulk")).json()["values"]}
    assert groups == {"DEV", "QA"}
    nowy = await account(demo, "nowy-dev")
    assert all([await role_of(demo, p, nowy) is None for p in PROJECTS])  # scenario H


async def test_scenarios_e_and_f_timeline(demo: httpx.AsyncClient) -> None:
    expected = {
        # E: only change 24d (+2h) old -> 5.9d left; comments keep read access, then nothing renews it.
        ("PAY", "kamil"): {0: "WARNING", 15: "DOWNSCOPE", 30: "REVOKE", 60: "REVOKE"},
        # F: Member who only comments (newest 5d old).
        ("QA", "marta"): {0: "DOWNSCOPE", 15: "DOWNSCOPE", 30: "REVOKE", 60: "REVOKE"},
        ("CORE", "kamil"): {0: "ACTIVE", 15: "ACTIVE", 30: "REVOKE"},
        # G: access to a project nobody uses.
        ("OPS", "ania"): {0: "REVOKE", 15: "REVOKE"},
        ("CORE", "tomasz-admin"): {0: "PERMANENT", 60: "PERMANENT"},
    }
    for (project, login), by_jump in expected.items():
        for days, want in by_jump.items():
            await jump_to(demo, days)
            assert await oracle(demo, project, login) == want, (project, login, days)


async def test_background_developers_spread_like_github(demo: httpx.AsyncClient) -> None:
    names = list(DEVS)

    async def states() -> list[str]:
        return [await oracle(demo, "CORE", name) for name in names]

    await jump_to(demo, 0)
    assert await states() == ["ACTIVE"] * 8 + ["DOWNSCOPE"] * 2  # iza, jan only comment
    await jump_to(demo, 15)
    assert await states() == ["ACTIVE"] * 7 + ["WARNING"] + ["DOWNSCOPE"] * 2  # henryk: change 23d old
    await jump_to(demo, 30)
    assert await states() == ["REVOKE"] * 10


async def test_project_settings_change_is_audited_but_never_renews(demo: httpx.AsyncClient) -> None:
    records = (await demo.get(f"{API}/auditing/record")).json()
    assert records["total"] == 1 and records["records"][0]["objectItem"]["name"] == "CORE"
    assert (await role_of(demo, "CORE", await account(demo, "tomasz-admin"))) is Role.ADMIN


async def test_remove_and_regrant_through_jira_api(demo: httpx.AsyncClient) -> None:
    acc = await account(demo, "bartek")
    member = f"{API}/project/CORE/role/{role_for(Role.WRITE).id}"
    assert (await demo.delete(member, params={"user": acc})).status_code == 204
    assert await role_of(demo, "CORE", acc) is None
    assert (await demo.post(member, json={"user": [acc]})).status_code == 200
    assert await role_of(demo, "CORE", acc) is Role.WRITE


async def test_last_admin_demo_step_returns_403(demo: httpx.AsyncClient) -> None:
    acc = await account(demo, "tomasz-admin")
    r = await demo.delete(f"{API}/project/PAY/role/{role_for(Role.ADMIN).id}", params={"user": acc})
    assert r.status_code == 403
    assert r.json()["errorMessages"] == ["Cannot remove the last administrator of the organization"]
