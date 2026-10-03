# Zadanie 6: Odczytowe endpointy mocka GitHuba — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecany) lub `superpowers:executing-plans`. Kroki używają checkboxów (`- [ ]`).

**Cel:** `GET /api/v3/orgs/{org}/members`, `GET /api/v3/repos/{owner}/{repo}/collaborators` i `GET /api/v3/repos/{owner}/{repo}/events` w formacie GitHub REST API v3 (nagłówki, paginacja `Link`, błędy `{"message", "documentation_url"}`).

**Architektura:** `GitHubMockAdapter` (`app/adapters/github_mock.py`) czyta dane z bazy. W Zadaniu 7 dostanie metody mutujące i zacznie implementować `VCSProvider`. Router (`app/api/github_mock/router.py`) to tylko warstwa HTTP, a serializacja do JSON GitHuba siedzi w `presenters.py`. Zależności FastAPI (`get_session`, `get_clock`, `get_github_mock`) trafiają do `app/api/deps.py`; aplikacja trzyma `session_factory` i `clock` w `app.state` (startup podpina Zadanie 11, testy ustawiają je ręcznie). **Commit transakcji robi warstwa HTTP**, adapter tylko `flush`.

**Stack:** FastAPI, SQLAlchemy async, httpx (testy).

**Spec:** ADR 0004; ADR 0006 §3, §5, §8; plan główny — Zadanie 6.

**Branch:** `feat/task-06-github-mock-reads` · **Zależności:** 2, 3, 5 · **Odblokowuje:** 7, 11

## Ograniczenia globalne

- Ścieżki, kody HTTP i kształty JSON jak w GitHub REST API (ADR 0004); błędy: `{"message": "Not Found", "documentation_url": "..."}`.
- Nagłówki na każdej odpowiedzi: `X-GitHub-Media-Type: github.v3; format=json`, `X-GitHub-Api-Version: 2022-11-28`, `X-RateLimit-*`.
- Paginacja: `page` (od 1), `per_page` (domyślnie 30, obcinane do 100), nagłówek `Link` z `rel="next"/"last"/"prev"/"first"`.
- Kolaborator = dzierżawa z `revoked_at IS NULL`.

## Review Focus

- **Odebrany dostęp na liście kolaboratorów:** dzierżawa z `revoked_at` nie może się pojawić → test `test_list_repo_collaborators`.
- **Kolejność zdarzeń:** GitHub zwraca najnowsze pierwsze → test `test_list_repo_events`.
- **`per_page` > 100:** GitHub obcina, nie zwraca 422 → test `test_pagination_sets_link_header_and_caps_per_page`.
- **Nieznane repo / org:** 404 w formacie GitHuba, nie `{"detail": ...}` → testy `test_unknown_repo_returns_github_404`, `test_unknown_org_returns_github_404`.
- **Wspólne połączenie testowe:** testy commitują sesję przed wywołaniem klienta, bo inaczej aplikacja nie zobaczy danych.

---

### Krok 1: Zależności i fixture klienta

**Pliki:**
- Utwórz: `backend/app/api/__init__.py`, `backend/app/api/deps.py`, `backend/app/adapters/__init__.py`, `backend/app/adapters/github_mock.py` (część odczytowa)
- Utwórz: `backend/tests/api/__init__.py`, `backend/tests/api/conftest.py`

**Interfejsy:**
- Konsumuje: `create_session_factory` (3), `TimeProvider` (2), `get_settings` (2), modele (3).
- Produkuje: `get_session`, `get_clock`, `get_app_settings`, `get_github_mock` oraz aliasy `SessionDep`, `ClockDep`, `SettingsDep`, `GitHubMockDep`; `GitHubMockAdapter(session, clock)` z metodami `org_exists`, `list_org_members`, `get_repository`, `list_collaborators`, `list_events`; fixture'y `fixed_now` i `client`.

- [ ] **1.1: Dodaj `backend/app/api/deps.py`:**

```python
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.github_mock import GitHubMockAdapter
from app.core.config import Settings, get_settings
from app.core.time_provider import TimeProvider


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session


def get_clock(request: Request) -> TimeProvider:
    return request.app.state.clock


def get_app_settings() -> Settings:
    return get_settings()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
ClockDep = Annotated[TimeProvider, Depends(get_clock)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]


def get_github_mock(session: SessionDep, clock: ClockDep) -> GitHubMockAdapter:
    return GitHubMockAdapter(session, clock)


GitHubMockDep = Annotated[GitHubMockAdapter, Depends(get_github_mock)]
```

- [ ] **1.2: Dodaj odczytową część adaptera** `backend/app/adapters/github_mock.py`:

```python
"""Adapter mocka GitHuba na bazie danych. Mutacje i VCSProvider: Zadanie 7."""

from typing import Literal

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityEvent, Lease, Repository, User
from app.ports.clock import ClockPort

MemberRole = Literal["all", "admin", "member"]


class GitHubMockAdapter:
    def __init__(self, session: AsyncSession, clock: ClockPort) -> None:
        self._session = session
        self._clock = clock

    async def org_exists(self, org: str) -> bool:
        return bool(await self._session.scalar(select(exists().where(Repository.owner == org))))

    async def list_org_members(self, org: str, role: MemberRole = "all") -> list[User]:
        query = select(User).order_by(User.id)
        if role == "admin":
            query = query.where(User.is_admin.is_(True))
        elif role == "member":
            query = query.where(User.is_admin.is_(False))
        return list((await self._session.scalars(query)).all())

    async def get_repository(self, owner: str, repo: str) -> Repository | None:
        return await self._session.scalar(select(Repository).where(Repository.owner == owner, Repository.name == repo))

    async def list_collaborators(self, repository: Repository) -> list[Lease]:
        query = (
            select(Lease)
            .where(Lease.repo_id == repository.id, Lease.revoked_at.is_(None))
            .order_by(Lease.user_id)
        )
        return list((await self._session.scalars(query)).all())

    async def list_events(self, repository: Repository) -> list[ActivityEvent]:
        query = (
            select(ActivityEvent)
            .where(ActivityEvent.repo_id == repository.id)
            .order_by(ActivityEvent.timestamp.desc(), ActivityEvent.id.desc())
        )
        return list((await self._session.scalars(query)).all())
```

- [ ] **1.3: Dodaj fixture'y** `backend/tests/api/conftest.py` (oraz pusty `tests/api/__init__.py`):

```python
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.time_provider import TimeProvider
from app.db.session import create_session_factory
from app.main import create_app

FIXED_NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


@pytest.fixture
def fixed_now() -> datetime:
    return FIXED_NOW


@pytest.fixture
async def client(engine: AsyncEngine) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app()
    app.state.session_factory = create_session_factory(engine)
    app.state.clock = TimeProvider(source=lambda: FIXED_NOW)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as http_client:
        yield http_client
```

---

### Krok 2: Prezentery JSON GitHuba

**Pliki:**
- Utwórz: `backend/app/api/github_mock/__init__.py`, `backend/app/api/github_mock/presenters.py`

**Interfejsy:**
- Konsumuje: `simple_user`, `GitHubCollaborator`, `GitHubEvent*`, `GitHubError` (5); `github_permissions`, `github_role_name` (5).
- Produkuje: `github_headers(now)`, `github_error(status, message, documentation_url, now) -> JSONResponse`, `paged_response(request, items, page, per_page, now) -> JSONResponse`, `member_json`, `collaborator_json`, `event_json`, stałe `DOCS_*`.

- [ ] **2.1: Dodaj** `backend/app/api/github_mock/presenters.py`:

```python
"""Serializacja do formatu GitHub REST API v3 (ADR 0004)."""

import hashlib
from datetime import datetime
from math import ceil
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from app.domain.enums import ActionType
from app.domain.roles import github_permissions, github_role_name
from app.models import ActivityEvent, Lease, User
from app.schemas.github import GitHubCollaborator, GitHubError, GitHubEvent, GitHubEventActor, GitHubEventRepo, simple_user

DOCS_MEMBERS = "https://docs.github.com/rest/orgs/members#list-organization-members"
DOCS_COLLABORATORS = "https://docs.github.com/rest/collaborators/collaborators"
DOCS_EVENTS = "https://docs.github.com/rest/activity/events#list-repository-events"
MAX_PER_PAGE = 100


def github_headers(now: datetime) -> dict[str, str]:
    return {
        "X-GitHub-Media-Type": "github.v3; format=json",
        "X-GitHub-Api-Version": "2022-11-28",
        "X-RateLimit-Limit": "5000",
        "X-RateLimit-Remaining": "4999",
        "X-RateLimit-Used": "1",
        "X-RateLimit-Resource": "core",
        "X-RateLimit-Reset": str(int(now.timestamp()) + 3600),
    }


def github_error(status: int, message: str, documentation_url: str, now: datetime) -> JSONResponse:
    body = GitHubError(message=message, documentation_url=documentation_url).model_dump()
    return JSONResponse(body, status_code=status, headers=github_headers(now))


def paged_response(request: Request, items: list[dict[str, Any]], page: int, per_page: int, now: datetime) -> JSONResponse:
    per_page = min(per_page, MAX_PER_PAGE)
    last_page = max(1, ceil(len(items) / per_page))
    headers = github_headers(now)

    def link(target: int, rel: str) -> str:
        return f'<{request.url.include_query_params(page=target, per_page=per_page)}>; rel="{rel}"'

    links: list[str] = []
    if page < last_page:
        links += [link(page + 1, "next"), link(last_page, "last")]
    if page > 1:
        links += [link(page - 1, "prev"), link(1, "first")]
    if links:
        headers["Link"] = ", ".join(links)
    return JSONResponse(items[(page - 1) * per_page : page * per_page], headers=headers)


def member_json(user: User, base_url: str) -> dict[str, Any]:
    return simple_user(user.login, user.id, base_url).model_dump()


def collaborator_json(lease: Lease, base_url: str) -> dict[str, Any]:
    collaborator = GitHubCollaborator(
        **simple_user(lease.user.login, lease.user.id, base_url).model_dump(),
        permissions=github_permissions(lease.current_role),
        role_name=github_role_name(lease.current_role),
    )
    return collaborator.model_dump()


def event_json(event: ActivityEvent, base_url: str) -> dict[str, Any]:
    full_name = f"{event.repo.owner}/{event.repo.name}"
    user = simple_user(event.user.login, event.user.id, base_url)
    github_event = GitHubEvent(
        id=str(event.id),
        type=event.action_type.value,
        actor=GitHubEventActor(
            id=user.id, login=user.login, display_login=user.login, url=user.url, avatar_url=user.avatar_url
        ),
        repo=GitHubEventRepo(id=event.repo.id, name=full_name, url=f"{base_url}/repos/{full_name}"),
        payload=_payload(event),
        created_at=event.timestamp,
    )
    return github_event.model_dump(mode="json")


def _sha(seed: str) -> str:
    return hashlib.sha1(seed.encode()).hexdigest()


def _payload(event: ActivityEvent) -> dict[str, Any]:
    created = event.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")
    if event.action_type is ActionType.PUSH:
        return {
            "repository_id": event.repo.id,
            "push_id": event.id,
            "size": 1,
            "distinct_size": 1,
            "ref": f"refs/heads/{event.repo.default_branch}",
            "head": _sha(f"head-{event.id}"),
            "before": _sha(f"before-{event.id}"),
            "commits": [],
        }
    if event.action_type is ActionType.PR_REVIEW:
        return {
            "action": "created",
            "review": {"id": event.id, "state": "approved", "submitted_at": created},
            "pull_request": {"number": event.id},
        }
    return {
        "action": "created",
        "issue": {"number": event.id},
        "comment": {"id": event.id, "body": "Looks good to me", "created_at": created},
    }
```

---

### Krok 3: Router odczytowy (TDD)

**Pliki:**
- Utwórz: `backend/app/api/github_mock/router.py`
- Zmień: `backend/app/main.py`
- Test: `backend/tests/api/test_github_mock_reads.py`

**Interfejsy:**
- Produkuje: `router` (prefix `/api/v3`) podłączony w `create_app()`.

- [ ] **3.1: Napisz testy** `backend/tests/api/test_github_mock_reads.py`:

```python
from datetime import datetime, timedelta

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType, Permission
from tests.factories import make_event, make_lease, make_repo, make_user

pytestmark = pytest.mark.anyio


async def test_list_org_members(client: httpx.AsyncClient, session: AsyncSession) -> None:
    await make_user(session, "tomasz-admin", team=None, is_admin=True)
    await make_user(session, "kamil-dev")
    await make_repo(session, "core-api")
    await session.commit()

    response = await client.get("/api/v3/orgs/longtails/members")
    admins = await client.get("/api/v3/orgs/longtails/members", params={"role": "admin"})

    assert response.status_code == 200
    assert response.headers["X-GitHub-Media-Type"] == "github.v3; format=json"
    assert [member["login"] for member in response.json()] == ["tomasz-admin", "kamil-dev"]
    assert response.json()[0]["type"] == "User"
    assert [member["login"] for member in admins.json()] == ["tomasz-admin"]


async def test_unknown_org_returns_github_404(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v3/orgs/nope/members")

    assert response.status_code == 404
    assert response.json()["message"] == "Not Found"
    assert "documentation_url" in response.json()


async def test_list_repo_collaborators(client: httpx.AsyncClient, session: AsyncSession, fixed_now: datetime) -> None:
    repo = await make_repo(session, "core-api")
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    writer = await make_user(session, "anna-dev")
    revoked = await make_user(session, "piotr-dev")
    await make_lease(session, admin, repo, Permission.ADMIN, granted_at=fixed_now, expires_at=None)
    await make_lease(session, writer, repo, Permission.WRITE, granted_at=fixed_now, expires_at=fixed_now)
    await make_lease(
        session, revoked, repo, Permission.WRITE, granted_at=fixed_now, expires_at=fixed_now, revoked_at=fixed_now
    )
    await session.commit()

    response = await client.get("/api/v3/repos/longtails/core-api/collaborators")

    body = response.json()
    assert response.status_code == 200
    assert [item["login"] for item in body] == ["tomasz-admin", "anna-dev"]
    assert body[0]["role_name"] == "admin"
    assert body[1]["permissions"] == {"admin": False, "maintain": False, "push": True, "triage": True, "pull": True}


async def test_list_repo_events(client: httpx.AsyncClient, session: AsyncSession, fixed_now: datetime) -> None:
    kamil = await make_user(session, "kamil-dev")
    repo = await make_repo(session, "core-api")
    await make_lease(session, kamil, repo, Permission.WRITE, granted_at=fixed_now, expires_at=fixed_now)
    await make_event(session, kamil, repo, ActionType.PUSH, fixed_now - timedelta(days=2))
    await make_event(session, kamil, repo, ActionType.PR_REVIEW, fixed_now - timedelta(days=1))
    await session.commit()

    response = await client.get("/api/v3/repos/longtails/core-api/events")

    body = response.json()
    assert response.status_code == 200
    assert [event["type"] for event in body] == ["PullRequestReviewEvent", "PushEvent"]
    assert body[1]["actor"]["login"] == "kamil-dev"
    assert body[1]["repo"]["name"] == "longtails/core-api"
    assert body[1]["payload"]["ref"] == "refs/heads/main"
    assert body[1]["created_at"] == "2026-10-01T12:00:00Z"


async def test_pagination_sets_link_header_and_caps_per_page(
    client: httpx.AsyncClient, session: AsyncSession, fixed_now: datetime
) -> None:
    kamil = await make_user(session, "kamil-dev")
    repo = await make_repo(session, "core-api")
    await make_lease(session, kamil, repo, Permission.WRITE, granted_at=fixed_now, expires_at=fixed_now)
    for days_ago in (1, 2, 3):
        await make_event(session, kamil, repo, ActionType.PUSH, fixed_now - timedelta(days=days_ago))
    await session.commit()

    first = await client.get("/api/v3/repos/longtails/core-api/events", params={"per_page": 2})
    capped = await client.get("/api/v3/repos/longtails/core-api/events", params={"per_page": 500})

    assert len(first.json()) == 2
    assert 'rel="next"' in first.headers["Link"] and "page=2" in first.headers["Link"]
    assert len(capped.json()) == 3
    assert "Link" not in capped.headers


async def test_unknown_repo_returns_github_404(client: httpx.AsyncClient) -> None:
    for path in ("collaborators", "events"):
        response = await client.get(f"/api/v3/repos/longtails/missing/{path}")

        assert response.status_code == 404
        assert response.json()["message"] == "Not Found"
```

- [ ] **3.2: Uruchom — RED.** Z `backend/`: `pytest tests/api/test_github_mock_reads.py -q` → FAIL, wszystkie endpointy zwracają 404 z `{"detail": "Not Found"}` (brak klucza `message`).

- [ ] **3.3: Dodaj router** `backend/app/api/github_mock/router.py` (oraz pusty `__init__.py` w tym katalogu):

```python
"""HTTP-owa twarz mocka GitHub REST API v3 (ADR 0004)."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from app.api.deps import ClockDep, GitHubMockDep, SettingsDep
from app.api.github_mock.presenters import (
    DOCS_COLLABORATORS,
    DOCS_EVENTS,
    DOCS_MEMBERS,
    collaborator_json,
    event_json,
    github_error,
    member_json,
    paged_response,
)

router = APIRouter(prefix="/api/v3", tags=["github-mock"])

Page = Annotated[int, Query(ge=1)]
PerPage = Annotated[int, Query(ge=1)]


@router.get("/orgs/{org}/members")
async def list_org_members(
    org: str,
    request: Request,
    github: GitHubMockDep,
    clock: ClockDep,
    settings: SettingsDep,
    role: Literal["all", "admin", "member"] = "all",
    page: Page = 1,
    per_page: PerPage = 30,
) -> JSONResponse:
    now = clock.get_current_time()
    if not await github.org_exists(org):
        return github_error(404, "Not Found", DOCS_MEMBERS, now)
    members = await github.list_org_members(org, role)
    items = [member_json(user, settings.github_api_base_url) for user in members]
    return paged_response(request, items, page, per_page, now)


@router.get("/repos/{owner}/{repo}/collaborators")
async def list_collaborators(
    owner: str,
    repo: str,
    request: Request,
    github: GitHubMockDep,
    clock: ClockDep,
    settings: SettingsDep,
    page: Page = 1,
    per_page: PerPage = 30,
) -> JSONResponse:
    now = clock.get_current_time()
    repository = await github.get_repository(owner, repo)
    if repository is None:
        return github_error(404, "Not Found", DOCS_COLLABORATORS, now)
    leases = await github.list_collaborators(repository)
    items = [collaborator_json(lease, settings.github_api_base_url) for lease in leases]
    return paged_response(request, items, page, per_page, now)


@router.get("/repos/{owner}/{repo}/events")
async def list_repo_events(
    owner: str,
    repo: str,
    request: Request,
    github: GitHubMockDep,
    clock: ClockDep,
    settings: SettingsDep,
    page: Page = 1,
    per_page: PerPage = 30,
) -> JSONResponse:
    now = clock.get_current_time()
    repository = await github.get_repository(owner, repo)
    if repository is None:
        return github_error(404, "Not Found", DOCS_EVENTS, now)
    events = await github.list_events(repository)
    items = [event_json(event, settings.github_api_base_url) for event in events]
    return paged_response(request, items, page, per_page, now)
```

- [ ] **3.4: Podłącz router w `backend/app/main.py`:**

```python
from fastapi import FastAPI

from app.api.github_mock.router import router as github_mock_router


def create_app() -> FastAPI:
    app = FastAPI(title="GitHub Access Lease Governor")
    app.include_router(github_mock_router)
    return app


app = create_app()
```

- [ ] **3.5: Uruchom — GREEN.** `pytest tests/api/test_github_mock_reads.py -q` → `6 passed`.

- [ ] **3.6: Commit.**

```bash
git add backend/app/api backend/app/adapters backend/app/main.py backend/tests/api
git commit -m "feat(github-mock): add read endpoints for members, collaborators and events"
```

---

### Krok 4: Weryfikacja

- [ ] **4.1:** Z `backend/`: `pytest -q && ruff check . && ruff format --check .` → zielone.
- [ ] **4.2:** `wc -l app/api/github_mock/*.py app/adapters/github_mock.py` → każdy ≤ 300.
- [ ] **4.3:** PR → `main`.
