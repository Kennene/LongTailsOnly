from datetime import timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.domain.enums import Role
from app.models import Lease, Repository, User
from tests.api.github_mock.conftest import BASE

API = "/api/v3/repos/longtails"


async def lease_of(engine: AsyncEngine, login: str, repo: str) -> Lease | None:
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        query = (
            select(Lease).join(User, User.id == Lease.user_id).join(Repository, Repository.id == Lease.repo_id)
            .where(User.login == login, Repository.name == repo)
        )
        return await s.scalar(query)


async def role_via_api(client: httpx.AsyncClient, repo: str, login: str) -> str:
    return (await client.get(f"{API}/{repo}/collaborators/{login}/permission")).json()["permission"]


async def test_put_new_collaborator_returns_201_with_invitation_shape(client: httpx.AsyncClient, engine: AsyncEngine) -> None:
    r = await client.put(f"{API}/auth-service/collaborators/dev-01", json={"permission": "push"})
    assert r.status_code == 201
    body = r.json()
    assert {"id", "node_id", "repository", "invitee", "inviter", "permissions"} <= body.keys()
    assert body["invitee"]["login"] == "dev-01" and body["permissions"] == "write"
    assert body["repository"]["full_name"] == "longtails/auth-service"
    lease = await lease_of(engine, "dev-01", "auth-service")
    assert lease is not None and lease.current_role is Role.WRITE
    assert lease.granted_at == BASE and lease.expires_at == BASE + timedelta(days=30)


async def test_put_existing_collaborator_changes_level_returns_204(client: httpx.AsyncClient, engine: AsyncEngine) -> None:
    r = await client.put(f"{API}/core-api/collaborators/dev-02", json={"permission": "push"})
    assert r.status_code == 204 and r.content == b""
    assert await role_via_api(client, "core-api", "dev-02") == "write"
    lease = await lease_of(engine, "dev-02", "core-api")
    assert lease is not None and lease.expires_at == BASE + timedelta(days=30)


async def test_put_same_role_is_noop(client: httpx.AsyncClient, engine: AsyncEngine, clock) -> None:
    clock.advance(10)
    r = await client.put(f"{API}/core-api/collaborators/dev-01", json={"permission": "push"})
    assert r.status_code == 204
    lease = await lease_of(engine, "dev-01", "core-api")
    assert lease is not None and lease.granted_at == BASE and lease.expires_at == BASE + timedelta(days=30)


async def test_put_admin_has_no_expiry(client: httpx.AsyncClient, engine: AsyncEngine) -> None:
    assert (await client.put(f"{API}/core-api/collaborators/dev-01", json={"permission": "admin"})).status_code == 204
    lease = await lease_of(engine, "dev-01", "core-api")
    assert lease is not None and lease.current_role is Role.ADMIN and lease.expires_at is None


async def test_put_default_permission_is_push(client: httpx.AsyncClient) -> None:
    r = await client.put(f"{API}/auth-service/collaborators/dev-02")
    assert r.status_code == 201 and r.json()["permissions"] == "write"


async def test_put_triage_and_maintain_collapse_to_read_and_write(client: httpx.AsyncClient) -> None:
    await client.put(f"{API}/auth-service/collaborators/dev-01", json={"permission": "triage"})
    await client.put(f"{API}/auth-service/collaborators/dev-02", json={"permission": "maintain"})
    assert await role_via_api(client, "auth-service", "dev-01") == "read"
    assert await role_via_api(client, "auth-service", "dev-02") == "write"


async def test_put_invalid_permission_returns_422(client: httpx.AsyncClient) -> None:
    r = await client.put(f"{API}/core-api/collaborators/dev-01", json={"permission": "root"})
    assert r.status_code == 422
    body = r.json()
    assert body["message"] == "Validation Failed" and body["errors"][0]["field"] == "permission"


async def test_put_unknown_user_or_repo_returns_404(client: httpx.AsyncClient) -> None:
    assert (await client.put(f"{API}/core-api/collaborators/ghost", json={"permission": "pull"})).status_code == 404
    assert (await client.put(f"{API}/nope/collaborators/dev-01", json={"permission": "pull"})).status_code == 404


async def test_ttl_uses_repo_default_lease_duration_days(client: httpx.AsyncClient, engine: AsyncEngine) -> None:
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        repo = await s.scalar(select(Repository).where(Repository.name == "auth-service"))
        assert repo is not None
        repo.default_lease_duration_days = 14
        await s.commit()
    await client.put(f"{API}/auth-service/collaborators/dev-01", json={"permission": "pull"})
    lease = await lease_of(engine, "dev-01", "auth-service")
    assert lease is not None and lease.expires_at == BASE + timedelta(days=14)


async def test_delete_returns_204_and_deactivates(client: httpx.AsyncClient, engine: AsyncEngine) -> None:
    r = await client.delete(f"{API}/core-api/collaborators/dev-01")
    assert r.status_code == 204
    lease = await lease_of(engine, "dev-01", "core-api")
    assert lease is not None and lease.is_active is False  # row kept for audit (ADR 0007)
    assert await role_via_api(client, "core-api", "dev-01") == "none"
    listed = (await client.get(f"{API}/core-api/collaborators")).json()
    assert "dev-01" not in {c["login"] for c in listed}


async def test_put_after_delete_reactivates_same_row(client: httpx.AsyncClient, engine: AsyncEngine, clock) -> None:
    before = await lease_of(engine, "dev-01", "core-api")
    await client.delete(f"{API}/core-api/collaborators/dev-01")
    clock.advance(5)
    r = await client.put(f"{API}/core-api/collaborators/dev-01", json={"permission": "pull"})
    assert r.status_code == 201
    lease = await lease_of(engine, "dev-01", "core-api")
    assert before is not None and lease is not None and lease.id == before.id
    assert lease.is_active and lease.current_role is Role.READ
    assert lease.granted_at == BASE + timedelta(days=5) and lease.expires_at == BASE + timedelta(days=35)


async def test_delete_non_collaborator_is_idempotent_204(client: httpx.AsyncClient) -> None:
    assert (await client.delete(f"{API}/core-api/collaborators/qa-01")).status_code == 204
    assert (await client.delete(f"{API}/core-api/collaborators/dev-01")).status_code == 204
    assert (await client.delete(f"{API}/core-api/collaborators/dev-01")).status_code == 204


async def test_delete_unknown_user_returns_404(client: httpx.AsyncClient) -> None:
    assert (await client.delete(f"{API}/core-api/collaborators/ghost")).status_code == 404


async def test_delete_sole_org_owner_returns_403(client: httpx.AsyncClient, engine: AsyncEngine) -> None:
    r = await client.delete(f"{API}/core-api/collaborators/tomasz-admin")
    assert r.status_code == 403
    assert r.json()["message"] == "Cannot remove the last administrator of the organization"
    assert "documentation_url" in r.json()
    assert await lease_of(engine, "tomasz-admin", "core-api") is not None


async def test_demote_sole_org_owner_returns_403(client: httpx.AsyncClient) -> None:
    r = await client.put(f"{API}/core-api/collaborators/tomasz-admin", json={"permission": "push"})
    assert r.status_code == 403 and "organization" in r.json()["message"]
    assert await role_via_api(client, "core-api", "tomasz-admin") == "admin"


async def _repo_with_sole_admin(db: AsyncSession) -> None:
    owner = User(login="repo-owner", name="Repo Owner")
    repo = Repository(name="solo", owner="longtails", default_branch="main")
    db.add_all([owner, repo])
    await db.flush()
    db.add(Lease(user_id=owner.id, repo_id=repo.id, current_role=Role.ADMIN, granted_at=BASE))
    await db.commit()


async def test_delete_last_repo_admin_returns_403(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await _repo_with_sole_admin(db)
    r = await client.delete(f"{API}/solo/collaborators/repo-owner")
    assert r.status_code == 403
    assert r.json()["message"] == "Cannot remove the last administrator of the repository"


async def test_put_demoting_last_repo_admin_returns_403(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await _repo_with_sole_admin(db)
    r = await client.put(f"{API}/solo/collaborators/repo-owner", json={"permission": "pull"})
    assert r.status_code == 403 and "repository" in r.json()["message"]


async def test_delete_admin_when_second_admin_exists_succeeds(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await _repo_with_sole_admin(db)
    assert (await client.put(f"{API}/solo/collaborators/dev-01", json={"permission": "admin"})).status_code == 201
    assert (await client.delete(f"{API}/solo/collaborators/repo-owner")).status_code == 204
    assert (await client.delete(f"{API}/solo/collaborators/dev-01")).status_code == 403  # now the last one
