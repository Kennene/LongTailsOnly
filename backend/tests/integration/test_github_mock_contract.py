"""End-to-end contract of the mock with the seeded demo data.

The status oracle below is a literal transcription of ADR 0002 / GLOSSARY (TTL 30 days, warning
window 7 days, write activity renews write+read, read activity renews only read). It is NOT the
lease engine: once `lease_service` exists, this test should call it instead of `oracle`.
"""
from datetime import UTC, datetime

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.models import ActivityEvent

TTL, WARN = 30, 7
API = "/api/v3"
SIM = "/api/v1/simulation/time-travel"
READ_LEVEL = {"PullRequestReviewEvent", "IssueCommentEvent"}
REPOS = (
    "core-api", "auth-service", "payment-service", "frontend-app", "infra-terraform",
    "notifications", "mobile-app", "data-pipeline", "qa-automation", "legacy-reports",
)
DEVS = ("ania", "bartek", "celina", "darek", "ewa", "filip", "gosia", "henryk", "iza", "jan")


async def all_pages(client: httpx.AsyncClient, url: str) -> list[dict]:
    out: list[dict] = []
    for page in range(1, 10):
        batch = (await client.get(url, params={"per_page": 100, "page": page})).json()
        out += batch
        if len(batch) < 100:
            break
    return out


def ts(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(UTC)


def status_for(newest: datetime | None, now: datetime) -> str:
    if newest is None:
        return "EXPIRED"
    remaining = TTL - (now - newest).total_seconds() / 86400
    return "EXPIRED" if remaining <= 0 else "WARNING" if remaining <= WARN else "ACTIVE"


async def oracle(client: httpx.AsyncClient, repo: str, login: str) -> str:
    """ACTIVE | WARNING | DOWNSCOPE | REVOKE | PERMANENT for one collaborator, from API data only."""
    now = ts((await client.get(SIM)).json()["now"])
    perm = (await client.get(f"{API}/repos/longtails/{repo}/collaborators/{login}/permission")).json()
    role = perm["permission"]
    if role == "admin":
        return "PERMANENT"
    mine = [e for e in await all_pages(client, f"{API}/repos/longtails/{repo}/events") if e["actor"]["login"] == login]

    def newest(types: set[str]) -> datetime | None:
        times = [ts(e["created_at"]) for e in mine if e["type"] in types]
        return max(times) if times else None

    if role == "write":
        state = status_for(newest({"PushEvent"}), now)
        if state != "EXPIRED":
            return state
        lower = newest(READ_LEVEL)
        return "DOWNSCOPE" if status_for(lower, now) != "EXPIRED" else "REVOKE"
    state = status_for(newest(READ_LEVEL | {"PushEvent"}), now)
    return "REVOKE" if state == "EXPIRED" else state


async def jump_to(client: httpx.AsyncClient, days: int) -> None:
    await client.delete(SIM)
    if days:
        await client.post(SIM, json={"days": days})


async def test_put_then_get_permission_roundtrip(demo: httpx.AsyncClient) -> None:
    url = f"{API}/repos/longtails/core-api/collaborators/nowy-dev"  # scenario D: no access yet
    assert (await demo.get(f"{url}/permission")).json()["permission"] == "none"
    assert (await demo.put(url, json={"permission": "pull"})).status_code == 201
    assert (await demo.get(f"{url}/permission")).json()["permission"] == "read"
    assert (await demo.put(url, json={"permission": "push"})).status_code == 204
    assert (await demo.get(f"{url}/permission")).json()["permission"] == "write"


async def test_delete_then_collaborators_list_excludes_user(demo: httpx.AsyncClient) -> None:
    base = f"{API}/repos/longtails/core-api/collaborators"
    before = {c["login"] for c in await all_pages(demo, base)}
    assert "ania" in before
    assert (await demo.delete(f"{base}/ania")).status_code == 204
    assert {c["login"] for c in await all_pages(demo, base)} == before - {"ania"}


async def test_teams_come_from_seed(demo: httpx.AsyncClient) -> None:
    teams = {t["slug"]: t for t in (await demo.get(f"{API}/orgs/longtails/teams")).json()}
    assert set(teams) == {"dev", "qa"}
    dev = await all_pages(demo, f"{API}/orgs/longtails/teams/dev/members")
    qa = await all_pages(demo, f"{API}/orgs/longtails/teams/qa/members")
    assert (len(dev), len(qa)) == (12, 6)
    assert len(await all_pages(demo, f"{API}/orgs/longtails/members")) == 19  # + tomasz-admin
    assert len(await all_pages(demo, f"{API}/orgs/longtails/repos")) == 10


async def test_scenario_timeline_matches_table(demo: httpx.AsyncClient) -> None:
    # Seed events sit at 10:00 of their day, "now" is 12:00 => every age is days + 2h.
    expected = {
        # A: only push is 25d old (+2h): 4.9d left -> WARNING; later reviews (2d, 5d) keep read access.
        ("payment-service", "kamil"): {0: "WARNING", 15: "DOWNSCOPE", 30: "REVOKE", 60: "REVOKE"},
        # B: single comment 27d old: 2.9d left -> WARNING, then nothing renews it.
        ("qa-automation", "marta"): {0: "WARNING", 15: "REVOKE", 30: "REVOKE", 60: "REVOKE"},
        # Kamil is busy in core-api (pushes 1-3d ago).
        ("core-api", "kamil"): {0: "ACTIVE", 15: "ACTIVE", 30: "REVOKE"},
        ("core-api", "tomasz-admin"): {0: "PERMANENT", 60: "PERMANENT"},
    }
    for (repo, login), by_jump in expected.items():
        for days, want in by_jump.items():
            await jump_to(demo, days)
            assert await oracle(demo, repo, login) == want, (repo, login, days)


async def test_background_developers_spread_at_plus_15_and_30(demo: httpx.AsyncClient) -> None:
    async def states() -> list[str]:
        return [await oracle(demo, "core-api", login) for login in DEVS]

    await jump_to(demo, 0)
    # ania..henryk pushed 1..8d ago (ACTIVE); iza/jan only reviewed (8d, 9d) => push lapsed, read alive.
    assert await states() == ["ACTIVE"] * 8 + ["DOWNSCOPE"] * 2
    await jump_to(demo, 15)
    assert await states() == ["ACTIVE"] * 7 + ["WARNING"] + ["DOWNSCOPE"] * 2  # henryk: push 23d old
    await jump_to(demo, 30)
    assert await states() == ["REVOKE"] * 10


async def test_last_admin_demo_step_returns_403(demo: httpx.AsyncClient) -> None:
    r = await demo.delete(f"{API}/repos/longtails/core-api/collaborators/tomasz-admin")
    assert r.status_code == 403
    assert r.json()["message"] == "Cannot remove the last administrator of the organization"
    after = await demo.get(f"{API}/repos/longtails/core-api/collaborators/tomasz-admin/permission")
    assert after.json()["permission"] == "admin"


async def test_extra_activity_is_visible_but_never_renews(demo: httpx.AsyncClient) -> None:
    core = await all_pages(demo, f"{API}/repos/longtails/core-api/events")
    types = {e["type"] for e in core}
    assert {"PushEvent", "PullRequestEvent", "PublicEvent"} <= types
    assert next(e for e in core if e["type"] == "PublicEvent")["actor"]["login"] == "tomasz-admin"
    assert await all_pages(demo, f"{API}/repos/longtails/legacy-reports/events") == []  # scenario C


async def test_events_endpoint_matches_activity_table_rows(demo: httpx.AsyncClient, engine: AsyncEngine) -> None:
    async with async_sessionmaker(engine)() as session:
        stored = await session.scalar(select(func.count()).select_from(ActivityEvent))
    total = sum([len(await all_pages(demo, f"{API}/repos/longtails/{repo}/events")) for repo in REPOS])
    assert total == stored  # every stored row (all within 90 days) is served by exactly one repo feed
