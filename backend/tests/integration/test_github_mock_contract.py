"""End-to-end contract of the mock with the seeded demo data.

The status oracle below is a literal transcription of ADR 0002 / GLOSSARY (TTL 30 days, warning
window 7 days, write activity renews write+read, read activity renews only read). It is NOT the
lease engine: once `lease_service` exists, this test should call it instead of `oracle`.
"""
from datetime import UTC, datetime

import httpx
from fastapi import FastAPI
from sqlalchemy import func, select

from app.models import ActivityEvent

TTL, WARN = 30, 7
API = "/api/v3"
SIM = "/api/v1/simulation/time-travel"
READ_LEVEL = {"PullRequestReviewEvent", "IssueCommentEvent"}


async def all_pages(client: httpx.AsyncClient, url: str) -> list[dict]:
    out: list[dict] = []
    for page in range(1, 10):
        batch = (await client.get(url, params={"per_page": 100, "page": page})).json()
        out += batch
        if len(batch) < 100:
            break
    return out


def ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def status_for(newest: datetime | None, now: datetime) -> str:
    if newest is None:
        return "EXPIRED"
    remaining = TTL - (now - newest).total_seconds() / 86400
    return "EXPIRED" if remaining <= 0 else "WARNING" if remaining <= WARN else "ACTIVE"


async def oracle(client: httpx.AsyncClient, repo: str, login: str) -> str:
    """ACTIVE | WARNING | DOWNSCOPE | REVOKE | PERMANENT for one collaborator, from API data only."""
    now = ts((await client.get(SIM)).json()["simulated_now"])
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
    await client.post(SIM, json={"reset": True})
    if days:
        await client.post(SIM, json={"days": days})


async def test_put_then_get_permission_roundtrip(demo: httpx.AsyncClient) -> None:
    url = f"{API}/repos/longtails/docs-site/collaborators/dev-new"
    assert (await demo.put(url, json={"permission": "pull"})).status_code == 201
    assert (await demo.get(f"{url}/permission")).json()["permission"] == "read"
    assert (await demo.put(url, json={"permission": "push"})).status_code == 204
    assert (await demo.get(f"{url}/permission")).json()["permission"] == "write"


async def test_delete_then_collaborators_list_excludes_user(demo: httpx.AsyncClient) -> None:
    before = {c["login"] for c in await all_pages(demo, f"{API}/repos/longtails/core-api/collaborators")}
    assert "dev-03" in before
    assert (await demo.delete(f"{API}/repos/longtails/core-api/collaborators/dev-03")).status_code == 204
    after = {c["login"] for c in await all_pages(demo, f"{API}/repos/longtails/core-api/collaborators")}
    assert after == before - {"dev-03"}


async def test_scenario_timeline_matches_table(demo: httpx.AsyncClient) -> None:
    expected = {
        ("payment-gw", "dev-kamil"): {0: "ACTIVE", 15: "DOWNSCOPE", 30: "REVOKE", 60: "REVOKE"},
        ("core-api", "qa-marta"): {0: "WARNING", 15: "REVOKE", 30: "REVOKE", 60: "REVOKE"},
    }
    for (repo, login), by_jump in expected.items():
        for days, want in by_jump.items():
            await jump_to(demo, days)
            assert await oracle(demo, repo, login) == want, (login, days)


async def test_background_developers_spread_at_plus_15_and_30(demo: httpx.AsyncClient) -> None:
    await jump_to(demo, 0)
    assert {await oracle(demo, "core-api", f"dev-{i:02d}") for i in range(1, 10)} == {"ACTIVE"}
    await jump_to(demo, 15)
    got = {i: await oracle(demo, "core-api", f"dev-{i:02d}") for i in range(1, 10)}
    assert [got[i] for i in (1, 2, 3, 4)] == ["ACTIVE"] * 4  # newest push 1, 3, 5, 7 days ago
    assert [got[i] for i in (5, 6, 7)] == ["WARNING"] * 3  # 9, 11, 13 days ago
    assert [got[i] for i in (8, 9)] == ["REVOKE"] * 2  # 15, 17 days ago
    await jump_to(demo, 30)
    assert {await oracle(demo, "core-api", f"dev-{i:02d}") for i in range(1, 10)} == {"REVOKE"}


async def test_pitch_jumps_25_and_35_work(demo: httpx.AsyncClient) -> None:
    await jump_to(demo, 25)
    assert await oracle(demo, "payment-gw", "dev-kamil") == "DOWNSCOPE"
    assert await oracle(demo, "core-api", "dev-01") == "WARNING"
    assert await oracle(demo, "core-api", "dev-05") == "REVOKE"
    await jump_to(demo, 35)
    assert await oracle(demo, "payment-gw", "dev-kamil") == "REVOKE"
    assert await oracle(demo, "core-api", "tomasz-admin") == "PERMANENT"


async def test_last_admin_demo_step_returns_403(demo: httpx.AsyncClient) -> None:
    r = await demo.delete(f"{API}/repos/longtails/core-api/collaborators/tomasz-admin")
    assert r.status_code == 403
    assert r.json()["message"] == "Cannot remove the last administrator of the organization"
    after = await demo.get(f"{API}/repos/longtails/core-api/collaborators/tomasz-admin/permission")
    assert after.json()["permission"] == "admin"


async def test_events_endpoint_matches_activity_table_rows(demo: httpx.AsyncClient, demo_app: FastAPI) -> None:
    async with demo_app.state.sessionmaker() as session:
        stored = await session.scalar(select(func.count()).select_from(ActivityEvent))
    total = 0
    for repo in ("core-api", "auth-service", "payment-gw", "frontend-app", "infra-terraform", "notifications",
                 "data-pipeline", "mobile-app", "docs-site", "legacy-reports"):
        total += len(await all_pages(demo, f"{API}/repos/longtails/{repo}/events"))
    assert total == stored  # every stored row (all within 90 days) is served by exactly one repo feed
