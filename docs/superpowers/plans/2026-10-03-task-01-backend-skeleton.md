# Zadanie 1: Szkielet backendu i kontrakty — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecany) lub `superpowers:executing-plans`. Kroki używają checkboxów (`- [ ]`).

**Cel:** Instalowalny projekt `backend/` z pustą aplikacją FastAPI, konfiguracją pytest/ruff oraz współdzielonymi kontraktami (enumy, porty), od których zależą Zadania 2–11.

**Architektura:** `create_app()` zwraca instancję FastAPI. Enumy i porty to czyste moduły bez zależności od bazy. To zadanie **scalamy do `main` jako pierwsze** — odblokowuje pracę równoległą (ADR 0006 §2).

**Stack:** Python 3.14, FastAPI, SQLAlchemy 2.0, aiosqlite, Pydantic v2, uvicorn; dev: pytest, httpx, ruff.

**Spec:** ADR 0006 §2–§4, §6, §8; plan główny — Zadanie 1.

**Branch:** `feat/task-01-backend-skeleton` · **Zależności:** brak · **Odblokowuje:** 2, 3, 4, 5, 8, 9, 10

## Ograniczenia globalne

- `requires-python = ">=3.14"`.
- Pliki ≤ 300 linii; jawne type hinty wszędzie.
- Enumy dokładnie jak w ADR 0006 §4 (wartości są kontraktem z frontendem).

## Review Focus

- **Instalacja w czystym venv:** `pip install -e '.[dev]'` musi działać bez ręcznych kroków → Krok 4.
- **Wartości enumów jako stringi w JSON:** `StrEnum` serializuje się do wartości (`"write"`, a nie `"Permission.WRITE"`) → test `test_enums_serialize_as_plain_strings`.
- **Mapowanie zdarzeń:** `EVENT_PERMISSION` musi pokrywać każdy `ActionType` → test `test_every_action_type_has_permission`.
- **Porty bez implementacji:** `Protocol` nie może wymagać dziedziczenia → test strukturalny `test_ports_are_structural`.
- **Puste `__init__.py` w testach:** bez nich pytest zgłosi konflikt nazw modułów przy identycznych nazwach plików w różnych katalogach.

---

### Krok 1: Konfiguracja projektu

**Pliki:**
- Utwórz: `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/tests/__init__.py`
- Test: `backend/tests/test_project_setup.py`

- [ ] **1.1: Napisz test konfiguracji** (`backend/tests/test_project_setup.py`; tylko stdlib, żeby działał przed instalacją):

```python
import tomllib
import unittest
from pathlib import Path

PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"


class ProjectSetupTest(unittest.TestCase):
    def test_pyproject_declares_backend_dependencies_and_pytest(self) -> None:
        config = tomllib.loads(PYPROJECT.read_text())
        project = config["project"]
        dependencies = " ".join(project["dependencies"])

        self.assertEqual(project["requires-python"], ">=3.14")
        for package in ("fastapi", "uvicorn", "sqlalchemy", "aiosqlite", "pydantic"):
            self.assertIn(package, dependencies)
        dev = " ".join(project["optional-dependencies"]["dev"])
        for package in ("pytest", "httpx", "ruff"):
            self.assertIn(package, dev)
        self.assertEqual(config["tool"]["pytest"]["ini_options"]["testpaths"], ["tests"])
```

- [ ] **1.2: Uruchom — RED.** Z `backend/`: `python -m unittest tests/test_project_setup.py -v`
Oczekiwane: `FileNotFoundError` (brak `pyproject.toml`).

- [ ] **1.3: Dodaj `backend/pyproject.toml`:**

```toml
[project]
name = "lease-governor"
version = "0.1.0"
requires-python = ">=3.14"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy>=2.0",
    "aiosqlite>=0.20",
    "pydantic>=2.8",
]

[project.optional-dependencies]
dev = ["pytest>=8", "httpx>=0.27", "ruff>=0.6"]

[build-system]
requires = ["setuptools>=69"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["app*"]

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 120
target-version = "py314"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
```

Utwórz puste `backend/app/__init__.py` i `backend/tests/__init__.py`.

- [ ] **1.4: Zainstaluj i uruchom — GREEN.** Z `backend/`:

```bash
python -m venv .venv && source .venv/bin/activate
python -m pip install -e '.[dev]'
python -m unittest tests/test_project_setup.py -v
```

Oczekiwane: instalacja OK, test PASS.

- [ ] **1.5: Dodaj `.gitignore`** w `backend/`: `.venv/`, `__pycache__/`, `*.db`, `.pytest_cache/`, `.ruff_cache/`, `*.egg-info/`.

- [ ] **1.6: Commit.**

```bash
git add backend/pyproject.toml backend/.gitignore backend/app/__init__.py backend/tests/__init__.py backend/tests/test_project_setup.py
git commit -m "chore(backend): add project configuration"
```

---

### Krok 2: Aplikacja FastAPI i konfiguracja testów async

**Pliki:**
- Utwórz: `backend/app/main.py`, `backend/tests/conftest.py`
- Test: `backend/tests/test_app.py`

**Interfejsy:**
- Produkuje: `app.main.create_app() -> FastAPI`, `app.main.app`; fixture `anyio_backend`.

- [ ] **2.1: Napisz test** `backend/tests/test_app.py`:

```python
import httpx
import pytest

from app.main import create_app

pytestmark = pytest.mark.anyio


async def test_app_serves_openapi_schema() -> None:
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "GitHub Access Lease Governor"
```

- [ ] **2.2: Dodaj `backend/tests/conftest.py`:**

```python
import pytest


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
```

- [ ] **2.3: Uruchom — RED.** Z `backend/`: `pytest tests/test_app.py -q`
Oczekiwane: `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **2.4: Dodaj `backend/app/main.py`:**

```python
from fastapi import FastAPI


def create_app() -> FastAPI:
    return FastAPI(title="GitHub Access Lease Governor")


app = create_app()
```

- [ ] **2.5: Uruchom — GREEN.** `pytest tests/test_app.py -q` → `1 passed`.

- [ ] **2.6: Commit.** `git add backend/app/main.py backend/tests/conftest.py backend/tests/test_app.py && git commit -m "feat(backend): add FastAPI app factory"`

---

### Krok 3: Enumy domenowe (kontrakt ADR 0006 §4)

**Pliki:**
- Utwórz: `backend/app/domain/__init__.py`, `backend/app/domain/enums.py`, `backend/tests/domain/__init__.py`
- Test: `backend/tests/domain/test_enums.py`

**Interfejsy:**
- Produkuje: `Team`, `Permission`, `ActionType`, `LeaseStatus`, `Recommendation`, `AppealStatus`, `ActorType`, `DecisionAction`, `EnforcementMode`, `AuditAction`, `EVENT_PERMISSION: dict[ActionType, Permission]`.

- [ ] **3.1: Napisz testy** `backend/tests/domain/test_enums.py`:

```python
import json

from app.domain.enums import (
    EVENT_PERMISSION,
    ActionType,
    ActorType,
    AppealStatus,
    AuditAction,
    DecisionAction,
    EnforcementMode,
    LeaseStatus,
    Permission,
    Recommendation,
    Team,
)


def test_enum_values_match_api_contract() -> None:
    assert [team.value for team in Team] == ["DEV", "QA"]
    assert [permission.value for permission in Permission] == ["admin", "write", "read"]
    assert [action.value for action in ActionType] == ["PushEvent", "PullRequestReviewEvent", "IssueCommentEvent"]
    assert [status.value for status in LeaseStatus] == ["ACTIVE", "WARNING", "EXPIRED", "PERMANENT", "REVOKED"]
    assert [item.value for item in Recommendation] == ["KEEP", "DOWNSCOPE", "REVOKE"]
    assert [status.value for status in AppealStatus] == ["PENDING", "APPROVED", "REJECTED"]
    assert [actor.value for actor in ActorType] == ["ADMIN", "USER", "SYSTEM"]
    assert [action.value for action in DecisionAction] == ["EXTEND", "DOWNSCOPE", "REVOKE", "REJECT"]
    assert [mode.value for mode in EnforcementMode] == ["warning", "auto"]
    assert {action.value for action in AuditAction} == {
        "LEASE_EXTENDED", "LEASE_DOWNSCOPED", "LEASE_REVOKED", "APPEAL_SUBMITTED", "APPEAL_REJECTED",
        "BASELINE_APPLIED", "TIME_TRAVEL", "POLICY_CHANGED", "LAST_ADMIN_BLOCKED",
    }


def test_every_action_type_has_permission() -> None:
    assert EVENT_PERMISSION == {
        ActionType.PUSH: Permission.WRITE,
        ActionType.PR_REVIEW: Permission.READ,
        ActionType.ISSUE_COMMENT: Permission.READ,
    }


def test_enums_serialize_as_plain_strings() -> None:
    assert json.dumps({"role": Permission.WRITE}) == '{"role": "write"}'
    assert Permission("write") == "write"
```

- [ ] **3.2: Uruchom — RED.** `pytest tests/domain/test_enums.py -q` → `ModuleNotFoundError`.

- [ ] **3.3: Dodaj `backend/app/domain/enums.py`** (oraz puste `app/domain/__init__.py`, `tests/domain/__init__.py`):

```python
"""Enumy domenowe — kontrakt z ADR 0006 §4 (wartości trafiają do API i frontendu)."""

from enum import StrEnum


class Team(StrEnum):
    DEV = "DEV"
    QA = "QA"


class Permission(StrEnum):
    ADMIN = "admin"
    WRITE = "write"
    READ = "read"


class ActionType(StrEnum):
    PUSH = "PushEvent"
    PR_REVIEW = "PullRequestReviewEvent"
    ISSUE_COMMENT = "IssueCommentEvent"


class LeaseStatus(StrEnum):
    ACTIVE = "ACTIVE"
    WARNING = "WARNING"
    EXPIRED = "EXPIRED"
    PERMANENT = "PERMANENT"
    REVOKED = "REVOKED"


class Recommendation(StrEnum):
    KEEP = "KEEP"
    DOWNSCOPE = "DOWNSCOPE"
    REVOKE = "REVOKE"


class AppealStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ActorType(StrEnum):
    ADMIN = "ADMIN"
    USER = "USER"
    SYSTEM = "SYSTEM"


class DecisionAction(StrEnum):
    EXTEND = "EXTEND"
    DOWNSCOPE = "DOWNSCOPE"
    REVOKE = "REVOKE"
    REJECT = "REJECT"


class EnforcementMode(StrEnum):
    WARNING = "warning"
    AUTO = "auto"


class AuditAction(StrEnum):
    LEASE_EXTENDED = "LEASE_EXTENDED"
    LEASE_DOWNSCOPED = "LEASE_DOWNSCOPED"
    LEASE_REVOKED = "LEASE_REVOKED"
    APPEAL_SUBMITTED = "APPEAL_SUBMITTED"
    APPEAL_REJECTED = "APPEAL_REJECTED"
    BASELINE_APPLIED = "BASELINE_APPLIED"
    TIME_TRAVEL = "TIME_TRAVEL"
    POLICY_CHANGED = "POLICY_CHANGED"
    LAST_ADMIN_BLOCKED = "LAST_ADMIN_BLOCKED"


EVENT_PERMISSION: dict[ActionType, Permission] = {
    ActionType.PUSH: Permission.WRITE,
    ActionType.PR_REVIEW: Permission.READ,
    ActionType.ISSUE_COMMENT: Permission.READ,
}
```

- [ ] **3.4: Uruchom — GREEN.** `pytest tests/domain/test_enums.py -q` → `3 passed`.

- [ ] **3.5: Commit.** `git add backend/app/domain backend/tests/domain && git commit -m "feat(domain): add shared domain enums"`

---

### Krok 4: Porty `ClockPort` i `VCSProvider`

**Pliki:**
- Utwórz: `backend/app/ports/__init__.py`, `backend/app/ports/clock.py`, `backend/app/ports/vcs_provider.py`, `backend/tests/ports/__init__.py`
- Test: `backend/tests/ports/test_ports.py`

**Interfejsy:**
- Produkuje: `ClockPort.get_current_time() -> datetime`; `VCSProvider.set_permission(owner, repo, username, permission) -> None`, `VCSProvider.remove_collaborator(owner, repo, username) -> None`; `LastAdminError`.

- [ ] **4.1: Napisz test** `backend/tests/ports/test_ports.py`:

```python
from datetime import UTC, datetime

from app.domain.enums import Permission
from app.ports.clock import ClockPort
from app.ports.vcs_provider import LastAdminError, VCSProvider


class FixedClock:
    def get_current_time(self) -> datetime:
        return datetime(2026, 1, 1, tzinfo=UTC)


class RecordingVCS:
    def __init__(self) -> None:
        self.calls: list[tuple[str, ...]] = []

    async def set_permission(self, owner: str, repo: str, username: str, permission: Permission) -> None:
        self.calls.append(("set", owner, repo, username, permission))

    async def remove_collaborator(self, owner: str, repo: str, username: str) -> None:
        self.calls.append(("remove", owner, repo, username))


def test_ports_are_structural() -> None:
    clock: ClockPort = FixedClock()
    vcs: VCSProvider = RecordingVCS()

    assert clock.get_current_time().tzinfo is UTC
    assert isinstance(vcs, RecordingVCS)


def test_last_admin_error_carries_message() -> None:
    error = LastAdminError("Cannot remove the last administrator of the repository")

    assert str(error) == "Cannot remove the last administrator of the repository"
```

- [ ] **4.2: Uruchom — RED.** `pytest tests/ports/test_ports.py -q` → `ModuleNotFoundError`.

- [ ] **4.3: Dodaj porty.**

`backend/app/ports/clock.py`:

```python
from datetime import datetime
from typing import Protocol


class ClockPort(Protocol):
    """Jedyne źródło czasu dla logiki domenowej (ADR 0003)."""

    def get_current_time(self) -> datetime: ...
```

`backend/app/ports/vcs_provider.py`:

```python
from typing import Protocol

from app.domain.enums import Permission


class LastAdminError(Exception):
    """Operacja zostawiłaby repozytorium lub organizację bez administratora (ADR 0004)."""


class VCSProvider(Protocol):
    """Port dostawcy VCS — w MVP implementuje go GitHubMockAdapter."""

    async def set_permission(self, owner: str, repo: str, username: str, permission: Permission) -> None: ...

    async def remove_collaborator(self, owner: str, repo: str, username: str) -> None: ...
```

Utwórz puste `app/ports/__init__.py` i `tests/ports/__init__.py`.

- [ ] **4.4: Uruchom — GREEN.** `pytest tests/ports/test_ports.py -q` → `2 passed`.

- [ ] **4.5: Commit.** `git add backend/app/ports backend/tests/ports && git commit -m "feat(ports): add clock and VCS provider ports"`

---

### Krok 5: Weryfikacja i szybki merge

- [ ] **5.1:** Z `backend/`: `pytest -q && ruff check . && ruff format --check .` → wszystko zielone (w razie potrzeby `ruff format .` i commit).
- [ ] **5.2:** Uruchom serwer: `uvicorn app.main:app --port 8000` i sprawdź `curl -s localhost:8000/openapi.json | head -c 80`.
- [ ] **5.3:** Otwórz PR `feat/task-01-backend-skeleton` → `main` i poproś o szybkie review. **Od tego PR zależy reszta zespołu.**
