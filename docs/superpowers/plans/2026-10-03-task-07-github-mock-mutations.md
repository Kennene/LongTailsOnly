# Zadanie 7: Zmiana dostępu i ochrona ostatniego administratora — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecany) lub `superpowers:executing-plans`. Kroki używają checkboxów (`- [ ]`).

**Cel:** `GitHubMockAdapter` implementuje port `VCSProvider` (`set_permission`, `remove_collaborator`) z regułą *Last Admin Protection*, a router udostępnia `PUT`/`DELETE /api/v3/repos/{owner}/{repo}/collaborators/{username}` oraz `DELETE /api/v3/orgs/{org}/members/{username}`.

**Architektura:** Reguła ostatniego admina żyje **w adapterze**, a nie w routerze. Dzięki temu chroni zarówno żądania HTTP mocka, jak i decyzje serwisów (Zadanie 10) i tryb `auto`. Adapter rzuca `LastAdminError` (port) i `GitHubMockNotFound`, a router tłumaczy je na 403/404 w formacie GitHuba. Odebranie dostępu ustawia `revoked_at`, nie usuwa wiersza.

**Stack:** FastAPI, SQLAlchemy async.

**Spec:** ADR 0004 §2–3; ADR 0006 §5–6; ADR 0007 §4; plan główny — Zadanie 7.

**Branch:** `feat/task-07-github-mock-mutations` · **Zależności:** 6 · **Odblokowuje:** 10 (realny adapter), 11, 19

## Ograniczenia globalne

- Komunikat 403: `Cannot remove the last administrator of the repository` / `... of the organization` (ADR 0004).
- `PUT` nowego kolaboratora → `201` z obiektem zaproszenia; istniejącego → `204` (zgodnie z GitHubem).
- Nowa dzierżawa: `granted_at = now`; `expires_at = now + repo.default_lease_days`, a dla `admin` `None` (ADR 0007).
- Mapowanie `permission` z GitHuba → MVP przez `from_github_permission` (Zadanie 5).

## Review Focus

- **Degradacja ostatniego admina przez PUT:** `PUT permission=push` na jedynym adminie musi dać 403, nie tylko `DELETE` → test `test_put_downgrading_last_admin_returns_403`.
- **Drugi admin istnieje:** usunięcie jednego z dwóch adminów jest dozwolone → test `test_delete_admin_when_another_admin_exists_returns_204`.
- **Odebrany admin się nie liczy:** admin z `revoked_at` nie jest „drugim adminem” → test `test_revoked_admin_does_not_count`.
- **Ponowne nadanie odebranego dostępu:** `PUT` na dzierżawie z `revoked_at` czyści `revoked_at` i liczy nowy okres → test `test_set_permission_restores_revoked_lease`.
- **Ostatni admin organizacji:** `DELETE /orgs/{org}/members/{username}` → 403 → test `test_delete_last_org_admin_returns_403`.

---

### Krok 1: Mutacje adaptera (`VCSProvider`)

**Pliki:**
- Zmień: `backend/app/adapters/github_mock.py`
- Test: `backend/tests/adapters/__init__.py` (pusty), `backend/tests/adapters/test_github_mock_adapter.py`

**Interfejsy:**
- Konsumuje: `VCSProvider`, `LastAdminError` (1), `ClockPort` (1), modele (3).
- Produkuje: `GitHubMockAdapter.set_permission(owner, repo, username, permission) -> None`, `.remove_collaborator(owner, repo, username) -> None`, `.remove_org_member(org, username) -> None`, `.is_collaborator(owner, repo, username) -> bool`, `.get_user(login) -> User | None`; wyjątek `GitHubMockNotFound(LookupError)`.

- [ ] **1.1: Napisz testy** `backend/tests/adapters/test_github_mock_adapter.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.github_mock import GitHubMockAdapter, GitHubMockNotFound
from app.domain.enums import Permission
from app.models import Lease
from app.ports.vcs_provider import LastAdminError, VCSProvider
from tests.factories import make_lease, make_repo, make_user

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


class FixedClock:
    def get_current_time(self) -> datetime:
        return NOW


def adapter(session: AsyncSession) -> VCSProvider:
    return GitHubMockAdapter(session, FixedClock())


async def test_set_permission_creates_lease_with_policy_expiry(session: AsyncSession) -> None:
    await make_user(session, "filip-dev")
    await make_repo(session, "core-api", lease_days=30)

    await adapter(session).set_permission("longtails", "core-api", "filip-dev", Permission.WRITE)

    lease = await session.scalar(select(Lease))
    assert lease.current_role is Permission.WRITE
    assert lease.granted_at == NOW
    assert lease.expires_at == NOW + timedelta(days=30)


async def test_set_permission_restores_revoked_lease(session: AsyncSession) -> None:
    user = await make_user(session, "piotr-dev")
    repo = await make_repo(session, "legacy-billing")
    lease = await make_lease(
        session, user, repo, Permission.WRITE, granted_at=NOW - timedelta(days=60),
        expires_at=NOW - timedelta(days=30), revoked_at=NOW - timedelta(days=1),
    )

    await adapter(session).set_permission("longtails", "legacy-billing", "piotr-dev", Permission.READ)

    assert lease.revoked_at is None
    assert lease.current_role is Permission.READ
    assert lease.expires_at == NOW + timedelta(days=30)


async def test_remove_collaborator_sets_revoked_at(session: AsyncSession) -> None:
    user = await make_user(session, "anna-dev")
    repo = await make_repo(session, "core-api")
    lease = await make_lease(session, user, repo, Permission.WRITE, granted_at=NOW, expires_at=NOW)

    await adapter(session).remove_collaborator("longtails", "core-api", "anna-dev")

    assert lease.revoked_at == NOW


async def test_remove_last_admin_raises(session: AsyncSession) -> None:
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    repo = await make_repo(session, "core-api")
    await make_lease(session, admin, repo, Permission.ADMIN, granted_at=NOW, expires_at=None)

    with pytest.raises(LastAdminError, match="last administrator of the repository"):
        await adapter(session).remove_collaborator("longtails", "core-api", "tomasz-admin")
    with pytest.raises(LastAdminError):
        await adapter(session).set_permission("longtails", "core-api", "tomasz-admin", Permission.WRITE)


async def test_revoked_admin_does_not_count(session: AsyncSession) -> None:
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    former = await make_user(session, "old-admin", team=None)
    repo = await make_repo(session, "core-api")
    await make_lease(session, admin, repo, Permission.ADMIN, granted_at=NOW, expires_at=None)
    await make_lease(session, former, repo, Permission.ADMIN, granted_at=NOW, expires_at=None, revoked_at=NOW)

    with pytest.raises(LastAdminError):
        await adapter(session).remove_collaborator("longtails", "core-api", "tomasz-admin")


async def test_unknown_repo_or_user_raises_not_found(session: AsyncSession) -> None:
    await make_repo(session, "core-api")

    with pytest.raises(GitHubMockNotFound):
        await adapter(session).set_permission("longtails", "core-api", "ghost", Permission.READ)
    with pytest.raises(GitHubMockNotFound):
        await adapter(session).remove_collaborator("longtails", "missing", "ghost")
```

- [ ] **1.2: Uruchom — RED.** Z `backend/`: `pytest tests/adapters -q` → `ImportError: cannot import name 'GitHubMockNotFound'`.

- [ ] **1.3: Rozszerz adapter.** W `backend/app/adapters/github_mock.py` dodaj importy:

```python
from datetime import timedelta

from sqlalchemy import func

from app.domain.enums import Permission
from app.ports.vcs_provider import LastAdminError
```

Pod `MemberRole` dodaj:

```python
REPO_LAST_ADMIN = "Cannot remove the last administrator of the repository"
ORG_LAST_ADMIN = "Cannot remove the last administrator of the organization"


class GitHubMockNotFound(LookupError):
    """Nieznane repozytorium, użytkownik lub organizacja (HTTP 404)."""
```

Na końcu klasy `GitHubMockAdapter` dopisz:

```python
    async def get_user(self, login: str) -> User | None:
        return await self._session.scalar(select(User).where(User.login == login))

    async def is_collaborator(self, owner: str, repo: str, username: str) -> bool:
        repository, user = await self._resolve(owner, repo, username)
        lease = await self._lease(repository, user)
        return lease is not None and lease.revoked_at is None

    async def set_permission(self, owner: str, repo: str, username: str, permission: Permission) -> None:
        repository, user = await self._resolve(owner, repo, username)
        lease = await self._lease(repository, user)
        now = self._clock.get_current_time()
        expires_at = None if permission is Permission.ADMIN else now + timedelta(days=repository.default_lease_days)
        if lease is None:
            self._session.add(
                Lease(user_id=user.id, repo_id=repository.id, current_role=permission, granted_at=now,
                      expires_at=expires_at)
            )
        else:
            if self._is_active_admin(lease) and permission is not Permission.ADMIN:
                await self._guard_repo_admin(repository)
            if lease.revoked_at is not None or lease.current_role is not permission:
                lease.current_role = permission
                lease.granted_at = now
                lease.expires_at = expires_at
                lease.revoked_at = None
        await self._session.flush()

    async def remove_collaborator(self, owner: str, repo: str, username: str) -> None:
        repository, user = await self._resolve(owner, repo, username)
        lease = await self._lease(repository, user)
        if lease is None or lease.revoked_at is not None:
            return
        if self._is_active_admin(lease):
            await self._guard_repo_admin(repository)
        lease.revoked_at = self._clock.get_current_time()
        await self._session.flush()

    async def remove_org_member(self, org: str, username: str) -> None:
        user = await self.get_user(username)
        if user is None or not await self.org_exists(org):
            raise GitHubMockNotFound(username)
        if user.is_admin:
            admins = await self._session.scalar(select(func.count()).where(User.is_admin.is_(True)))
            if admins <= 1:
                raise LastAdminError(ORG_LAST_ADMIN)
        now = self._clock.get_current_time()
        leases = await self._session.scalars(select(Lease).where(Lease.user_id == user.id, Lease.revoked_at.is_(None)))
        for lease in leases:
            lease.revoked_at = now
        await self._session.flush()

    async def _resolve(self, owner: str, repo: str, username: str) -> tuple[Repository, User]:
        repository = await self.get_repository(owner, repo)
        user = await self.get_user(username)
        if repository is None or user is None:
            raise GitHubMockNotFound(f"{owner}/{repo}:{username}")
        return repository, user

    async def _lease(self, repository: Repository, user: User) -> Lease | None:
        return await self._session.scalar(
            select(Lease).where(Lease.repo_id == repository.id, Lease.user_id == user.id)
        )

    @staticmethod
    def _is_active_admin(lease: Lease) -> bool:
        return lease.current_role is Permission.ADMIN and lease.revoked_at is None

    async def _guard_repo_admin(self, repository: Repository) -> None:
        admins = await self._session.scalar(
            select(func.count()).where(
                Lease.repo_id == repository.id,
                Lease.current_role == Permission.ADMIN,
                Lease.revoked_at.is_(None),
            )
        )
        if admins <= 1:
            raise LastAdminError(REPO_LAST_ADMIN)
```

Uwaga: `remove_org_member` dla organizacji z wieloma adminami odbiera wszystkie dostępy użytkownika, ale go nie usuwa (w MVP brak osobnej tabeli członkostwa — ograniczenie opisz w PR).

- [ ] **1.4: Uruchom — GREEN.** `pytest tests/adapters -q` → `6 passed`.

- [ ] **1.5: Commit.** `git add backend/app/adapters/github_mock.py backend/tests/adapters && git commit -m "feat(github-mock): implement VCSProvider with last admin protection"`

---

### Krok 2: Endpointy mutujące

**Pliki:**
- Zmień: `backend/app/api/github_mock/router.py`, `backend/app/api/github_mock/presenters.py`
- Test: `backend/tests/api/test_github_mock_mutations.py`

**Interfejsy:**
- Produkuje: `PUT/DELETE /api/v3/repos/{owner}/{repo}/collaborators/{username}`, `DELETE /api/v3/orgs/{org}/members/{username}`.

- [ ] **2.1: Napisz testy** `backend/tests/api/test_github_mock_mutations.py`:

```python
from datetime import datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import Permission
from app.models import Lease
from tests.factories import make_lease, make_repo, make_user

pytestmark = pytest.mark.anyio
COLLABORATORS = "/api/v3/repos/longtails/core-api/collaborators"


async def lease_for(session: AsyncSession, user_id: int) -> Lease:
    session.expire_all()
    return await session.scalar(select(Lease).where(Lease.user_id == user_id))


async def test_put_changes_collaborator_permission(
    client: httpx.AsyncClient, session: AsyncSession, fixed_now: datetime
) -> None:
    repo = await make_repo(session, "core-api")
    user = await make_user(session, "kamil-dev")
    await make_lease(session, user, repo, Permission.WRITE, granted_at=fixed_now, expires_at=fixed_now)
    await session.commit()

    response = await client.put(f"{COLLABORATORS}/kamil-dev", json={"permission": "pull"})

    assert response.status_code == 204
    assert (await lease_for(session, user.id)).current_role is Permission.READ


async def test_put_adds_new_collaborator_returns_201(
    client: httpx.AsyncClient, session: AsyncSession, fixed_now: datetime
) -> None:
    await make_repo(session, "core-api")
    await make_user(session, "tomasz-admin", team=None, is_admin=True)
    user = await make_user(session, "filip-dev")
    await session.commit()

    response = await client.put(f"{COLLABORATORS}/filip-dev", json={"permission": "push"})

    assert response.status_code == 201
    assert response.json()["invitee"]["login"] == "filip-dev"
    assert response.json()["permissions"] == "write"
    assert (await lease_for(session, user.id)).expires_at == fixed_now + timedelta(days=30)


async def test_put_rejects_unknown_permission_with_422(client: httpx.AsyncClient, session: AsyncSession) -> None:
    await make_repo(session, "core-api")
    await make_user(session, "kamil-dev")
    await session.commit()

    response = await client.put(f"{COLLABORATORS}/kamil-dev", json={"permission": "owner"})

    assert response.status_code == 422


async def test_delete_removes_collaborator(client: httpx.AsyncClient, session: AsyncSession, fixed_now: datetime) -> None:
    repo = await make_repo(session, "core-api")
    user = await make_user(session, "anna-dev")
    await make_lease(session, user, repo, Permission.WRITE, granted_at=fixed_now, expires_at=fixed_now)
    await session.commit()

    response = await client.delete(f"{COLLABORATORS}/anna-dev")
    listing = await client.get(COLLABORATORS)

    assert response.status_code == 204
    assert (await lease_for(session, user.id)).revoked_at == fixed_now
    assert listing.json() == []


async def test_delete_last_repository_admin_returns_403(
    client: httpx.AsyncClient, session: AsyncSession, fixed_now: datetime
) -> None:
    repo = await make_repo(session, "core-api")
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    await make_lease(session, admin, repo, Permission.ADMIN, granted_at=fixed_now, expires_at=None)
    await session.commit()

    response = await client.delete(f"{COLLABORATORS}/tomasz-admin")

    assert response.status_code == 403
    assert response.json()["message"] == "Cannot remove the last administrator of the repository"
    assert "documentation_url" in response.json()


async def test_put_downgrading_last_admin_returns_403(
    client: httpx.AsyncClient, session: AsyncSession, fixed_now: datetime
) -> None:
    repo = await make_repo(session, "core-api")
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    await make_lease(session, admin, repo, Permission.ADMIN, granted_at=fixed_now, expires_at=None)
    await session.commit()

    response = await client.put(f"{COLLABORATORS}/tomasz-admin", json={"permission": "push"})

    assert response.status_code == 403


async def test_delete_admin_when_another_admin_exists_returns_204(
    client: httpx.AsyncClient, session: AsyncSession, fixed_now: datetime
) -> None:
    repo = await make_repo(session, "core-api")
    for login in ("tomasz-admin", "second-admin"):
        admin = await make_user(session, login, team=None, is_admin=True)
        await make_lease(session, admin, repo, Permission.ADMIN, granted_at=fixed_now, expires_at=None)
    await session.commit()

    response = await client.delete(f"{COLLABORATORS}/second-admin")

    assert response.status_code == 204


async def test_delete_last_org_admin_returns_403(client: httpx.AsyncClient, session: AsyncSession) -> None:
    await make_repo(session, "core-api")
    await make_user(session, "tomasz-admin", team=None, is_admin=True)
    await session.commit()

    response = await client.delete("/api/v3/orgs/longtails/members/tomasz-admin")

    assert response.status_code == 403
    assert response.json()["message"] == "Cannot remove the last administrator of the organization"


async def test_mutations_on_unknown_repo_return_404(client: httpx.AsyncClient) -> None:
    put = await client.put("/api/v3/repos/longtails/missing/collaborators/ghost", json={"permission": "pull"})
    delete = await client.delete("/api/v3/repos/longtails/missing/collaborators/ghost")

    assert put.status_code == 404
    assert delete.status_code == 404
```

- [ ] **2.2: Uruchom — RED.** `pytest tests/api/test_github_mock_mutations.py -q` → FAIL, `405 Method Not Allowed`.

- [ ] **2.3: Dodaj prezenter zaproszenia.** W `presenters.py` rozszerz import o `GitHubInvitation`, dodaj stałą `DOCS_ORG_MEMBERS = "https://docs.github.com/rest/orgs/members#remove-an-organization-member"` i funkcję:

```python
def invitation_json(lease: Lease, inviter: User, base_url: str) -> dict[str, Any]:
    full_name = f"{lease.repo.owner}/{lease.repo.name}"
    invitation = GitHubInvitation(
        id=lease.id,
        invitee=simple_user(lease.user.login, lease.user.id, base_url),
        inviter=simple_user(inviter.login, inviter.id, base_url),
        permissions=github_role_name(lease.current_role),
        url=f"{base_url}/user/repository_invitations/{lease.id}",
        html_url=f"https://github.com/{full_name}/invitations",
    )
    return invitation.model_dump()
```

- [ ] **2.4: Dodaj endpointy.** W `router.py` rozszerz importy:

```python
from fastapi import Body, Response

from app.adapters.github_mock import GitHubMockNotFound
from app.api.deps import SessionDep
from app.api.github_mock.presenters import DOCS_ORG_MEMBERS, invitation_json
from app.domain.roles import from_github_permission
from app.ports.vcs_provider import LastAdminError
from app.schemas.github import PutCollaboratorRequest
```

Na końcu pliku dopisz:

```python
@router.put("/repos/{owner}/{repo}/collaborators/{username}", response_model=None)
async def put_collaborator(
    owner: str,
    repo: str,
    username: str,
    github: GitHubMockDep,
    session: SessionDep,
    clock: ClockDep,
    settings: SettingsDep,
    body: PutCollaboratorRequest | None = Body(default=None),
) -> Response:
    now = clock.get_current_time()
    permission = from_github_permission((body or PutCollaboratorRequest()).permission)
    try:
        existed = await github.is_collaborator(owner, repo, username)
        await github.set_permission(owner, repo, username, permission)
    except GitHubMockNotFound:
        return github_error(404, "Not Found", DOCS_COLLABORATORS, now)
    except LastAdminError as error:
        return github_error(403, str(error), DOCS_COLLABORATORS, now)
    await session.commit()
    if existed:
        return Response(status_code=204, headers=github_headers(now))
    repository = await github.get_repository(owner, repo)
    lease = next(item for item in await github.list_collaborators(repository) if item.user.login == username)
    inviter = await github.get_user(settings.admin_login) or lease.user
    return JSONResponse(invitation_json(lease, inviter, settings.github_api_base_url), status_code=201,
                        headers=github_headers(now))


@router.delete("/repos/{owner}/{repo}/collaborators/{username}", response_model=None)
async def delete_collaborator(
    owner: str, repo: str, username: str, github: GitHubMockDep, session: SessionDep, clock: ClockDep
) -> Response:
    now = clock.get_current_time()
    try:
        await github.remove_collaborator(owner, repo, username)
    except GitHubMockNotFound:
        return github_error(404, "Not Found", DOCS_COLLABORATORS, now)
    except LastAdminError as error:
        return github_error(403, str(error), DOCS_COLLABORATORS, now)
    await session.commit()
    return Response(status_code=204, headers=github_headers(now))


@router.delete("/orgs/{org}/members/{username}", response_model=None)
async def delete_org_member(
    org: str, username: str, github: GitHubMockDep, session: SessionDep, clock: ClockDep
) -> Response:
    now = clock.get_current_time()
    try:
        await github.remove_org_member(org, username)
    except GitHubMockNotFound:
        return github_error(404, "Not Found", DOCS_ORG_MEMBERS, now)
    except LastAdminError as error:
        return github_error(403, str(error), DOCS_ORG_MEMBERS, now)
    await session.commit()
    return Response(status_code=204, headers=github_headers(now))
```

Dodaj `github_headers` do importu z `presenters`.

- [ ] **2.5: Uruchom — GREEN.** `pytest tests/api -q` → `15 passed` (6 odczytowych z Zadania 6 + 9 nowych).

- [ ] **2.6: Commit.** `git add backend/app/api/github_mock backend/tests/api/test_github_mock_mutations.py && git commit -m "feat(github-mock): add collaborator mutations and org member removal"`

---

### Krok 3: Weryfikacja

- [ ] **3.1:** Z `backend/`: `pytest -q && ruff check . && ruff format --check .` → zielone.
- [ ] **3.2:** `wc -l app/adapters/github_mock.py app/api/github_mock/*.py` → każdy ≤ 300. Jeśli `router.py` przekroczy limit, wydziel mutacje do `app/api/github_mock/mutations.py` z osobnym `APIRouter` dołączonym w `router.py`.
- [ ] **3.3:** PR → `main`.
