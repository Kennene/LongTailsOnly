from datetime import timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.domain.enums import Role
from app.models import Lease, Repository, User
from tests.api.jira_mock.conftest import API, BASE, acc, role_id


async def lease_of(engine: AsyncEngine, login: str, project: str) -> Lease | None:
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        query = (
            select(Lease).join(User, User.id == Lease.user_id).join(Repository, Repository.id == Lease.repo_id)
            .where(User.login == login, Repository.name == project)
        )
        return await s.scalar(query)


def url(project: str, role: Role) -> str:
    return f"{API}/project/{project}/role/{role_id(role)}"


async def test_post_adds_actor_with_ttl_and_returns_role(client: httpx.AsyncClient, engine: AsyncEngine) -> None:
    r = await client.post(url("QA", Role.WRITE), json={"user": [acc("dev-01")]})
    assert r.status_code == 200
    assert [a["actorUser"]["accountId"] for a in r.json()["actors"]] == [acc("dev-01")]
    lease = await lease_of(engine, "dev-01", "QA")
    assert lease is not None and lease.current_role is Role.WRITE
    assert lease.granted_at == BASE and lease.expires_at == BASE + timedelta(days=30)


async def test_adding_to_another_role_changes_level(client: httpx.AsyncClient, engine: AsyncEngine) -> None:
    await client.post(url("PAY", Role.READ), json={"user": [acc("dev-01")]})
    lease = await lease_of(engine, "dev-01", "PAY")
    assert lease is not None and lease.current_role is Role.READ
    member = (await client.get(url("PAY", Role.WRITE))).json()
    assert member["actors"] == []


async def test_administrator_has_no_expiry(client: httpx.AsyncClient, engine: AsyncEngine) -> None:
    await client.post(url("PAY", Role.ADMIN), json={"user": [acc("dev-01")]})
    lease = await lease_of(engine, "dev-01", "PAY")
    assert lease is not None and lease.current_role is Role.ADMIN and lease.expires_at is None


async def test_post_unknown_user_and_group_actor(client: httpx.AsyncClient) -> None:
    assert (await client.post(url("PAY", Role.READ), json={"user": ["ghost"]})).status_code == 404
    r = await client.post(url("PAY", Role.READ), json={"group": ["DEV"]})
    assert r.status_code == 400 and "Group actors" in r.json()["errorMessages"][0]
    assert (await client.post(f"{API}/project/NOPE/role/1", json={"user": []})).status_code == 404


async def test_put_replaces_actor_set(client: httpx.AsyncClient, engine: AsyncEngine) -> None:
    body = {"categorisedActors": {"atlassian-user-role-actor": [acc("dev-02"), acc("qa-01")]}}
    r = await client.put(url("PAY", Role.READ), json=body)
    assert r.status_code == 200
    assert {a["actorUser"]["accountId"] for a in r.json()["actors"]} == {acc("dev-02"), acc("qa-01")}
    r = await client.put(url("PAY", Role.READ), json={"categorisedActors": {"atlassian-user-role-actor": [acc("qa-01")]}})
    assert [a["actorUser"]["accountId"] for a in r.json()["actors"]] == [acc("qa-01")]
    lease = await lease_of(engine, "dev-02", "PAY")
    assert lease is not None and lease.is_active is False


async def test_delete_deactivates_and_is_idempotent(client: httpx.AsyncClient, engine: AsyncEngine) -> None:
    target = url("PAY", Role.WRITE)
    assert (await client.delete(target, params={"user": acc("dev-01")})).status_code == 204
    lease = await lease_of(engine, "dev-01", "PAY")
    assert lease is not None and lease.is_active is False  # kept for audit
    assert (await client.delete(target, params={"user": acc("dev-01")})).status_code == 204
    # not an actor of that role: nothing happens
    assert (await client.delete(url("PAY", Role.ADMIN), params={"user": acc("dev-02")})).status_code == 204
    again = await lease_of(engine, "dev-02", "PAY")
    assert again is not None and again.is_active is True
    assert (await client.delete(target)).status_code == 400
    assert (await client.delete(target, params={"user": "ghost"})).status_code == 404


async def test_post_after_delete_reactivates_same_row(client: httpx.AsyncClient, engine: AsyncEngine, clock) -> None:
    before = await lease_of(engine, "dev-01", "PAY")
    await client.delete(url("PAY", Role.WRITE), params={"user": acc("dev-01")})
    clock.advance(5)
    await client.post(url("PAY", Role.READ), json={"user": [acc("dev-01")]})
    lease = await lease_of(engine, "dev-01", "PAY")
    assert before is not None and lease is not None and lease.id == before.id
    assert lease.is_active and lease.current_role is Role.READ
    assert lease.expires_at == BASE + timedelta(days=35)


async def test_removing_sole_org_owner_is_403_in_jira_format(client: httpx.AsyncClient) -> None:
    r = await client.delete(url("PAY", Role.ADMIN), params={"user": acc("tomasz-admin")})
    assert r.status_code == 403
    assert r.json()["errorMessages"] == ["Cannot remove the last administrator of the organization"]
    demote = await client.post(url("PAY", Role.READ), json={"user": [acc("tomasz-admin")]})
    assert demote.status_code == 403


async def test_removing_last_project_admin_is_403(client: httpx.AsyncClient, db) -> None:
    owner = User(login="proj-owner", name="Owner")
    db.add(owner)
    await db.flush()
    repo = await db.scalar(select(Repository).where(Repository.name == "QA"))
    assert repo is not None
    # tomasz-admin is also admin of QA; remove him first is blocked by org rule, so use a fresh project
    solo = Repository(name="SOLO", owner="longtails", provider=repo.provider)
    db.add(solo)
    await db.flush()
    db.add(Lease(user_id=owner.id, repo_id=solo.id, current_role=Role.ADMIN, granted_at=BASE))
    await db.commit()
    r = await client.delete(url("SOLO", Role.ADMIN), params={"user": acc("proj-owner")})
    assert r.status_code == 403 and r.json()["errorMessages"] == ["Cannot remove the last administrator of the project"]
    put = await client.put(url("SOLO", Role.ADMIN), json={"categorisedActors": {"atlassian-user-role-actor": []}})
    assert put.status_code == 403
    second = await client.post(url("SOLO", Role.ADMIN), json={"user": [acc("dev-01")]})
    assert second.status_code == 200
    assert (await client.delete(url("SOLO", Role.ADMIN), params={"user": acc("proj-owner")})).status_code == 204
