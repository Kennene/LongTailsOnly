# Zadanie 9: Baseline zespołu i onboarding — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecany) lub `superpowers:executing-plans`. Kroki używają checkboxów (`- [ ]`).

**Cel:** Algorytm 50% (ADR 0005, ADR 0007 §7) jako czysta funkcja, serwis `get_team_baseline` dla API oraz `apply_baseline` (onboarding nowej osoby przez `VCSProvider` z wpisem w audycie).

**Architektura:** `app/domain/baseline_rules.py` (Część A) liczy standard z listy `MemberActivity`. `app/services/baseline_service.py` (Część B) pobiera członków i zdarzenia, a następnie mapuje wynik na `BaselineView`. `apply_baseline` (Część C) nadaje dostęp wyłącznie przez port `VCSProvider` i zapisuje `BASELINE_APPLIED` przez `audit_service` z Zadania 10.

**Stack:** Python 3.14; SQLAlchemy async.

**Spec:** ADR 0005 §1; ADR 0007 §7; ADR 0006 §7 (`BaselineView`, `POST /baseline/{team}/apply`); `PRODUKT.md` UC-1; plan główny — Zadanie 9.

**Branch:** `feat/task-09-team-baseline` · **Zależności:** A → 1, 5 (`rank`); B → 3, 5; C → 10 (Krok 1: `audit_service`, `errors`) · **Odblokowuje:** 11, 16

## Ograniczenia globalne

- Członkowie = `team == T` i `is_admin == False`. Okno `[now - 30 dni, now]`.
- Repozytorium w standardzie ⇔ `2 × aktywni >= członkowie` (dokładnie 50% wystarcza).
- Rola: `write`, gdy co najmniej połowa aktywnych ma zdarzenie `write`; w przeciwnym razie `read`; **nigdy `admin`**.
- `apply_baseline` nie dotyka repozytoriów, w których osoba ma już aktywny dostęp.

## Review Focus

- **Dokładnie 50%:** 6/12 wchodzi, 5/12 nie → test `test_baseline_requires_half_of_team`.
- **Pusty zespół:** zero członków nie może dzielić przez zero ani „łapać” każdego repo → test `test_empty_team_has_no_baseline`.
- **Zdarzenia spoza zespołu i spoza okna:** nie liczą się do progu → test `test_baseline_ignores_non_members_and_old_events`.
- **Ponowny onboarding:** drugie `apply` nie nadaje nic drugi raz i nie dubluje audytu → test `test_apply_baseline_skips_existing_access`.
- **Osoba spoza zespołu:** `apply` dla `marta-qa` na standard DEV → błąd 422 → test `test_apply_baseline_rejects_user_from_other_team`.

---

## Część A — czysty algorytm

### Krok A1: `compute_baseline`

**Pliki:**
- Utwórz: `backend/app/domain/baseline_rules.py`
- Test: `backend/tests/domain/test_baseline_rules.py`

**Interfejsy:**
- Produkuje: `MemberActivity(user_id, repo_id, permission, occurred_at)`, `BaselineEntry(repo_id, active_members, proposed_role)`, `compute_baseline(member_ids, activity, now, window_days=30) -> list[BaselineEntry]` (posortowane po `repo_id`).

- [ ] **A1.1: Napisz testy** `backend/tests/domain/test_baseline_rules.py`:

```python
from datetime import UTC, datetime, timedelta

from app.domain.baseline_rules import BaselineEntry, MemberActivity, compute_baseline
from app.domain.enums import Permission

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
TEAM = set(range(1, 13))  # 12 członków


def act(user_id: int, repo_id: int, permission: Permission = Permission.WRITE, days_ago: int = 1) -> MemberActivity:
    return MemberActivity(user_id, repo_id, permission, NOW - timedelta(days=days_ago))


def test_baseline_requires_half_of_team() -> None:
    activity = [act(user, 1) for user in range(1, 7)] + [act(user, 2) for user in range(1, 6)]

    entries = compute_baseline(TEAM, activity, NOW)

    assert entries == [BaselineEntry(repo_id=1, active_members=6, proposed_role=Permission.WRITE)]


def test_baseline_uses_lowest_sufficient_role() -> None:
    mostly_readers = [act(1, 1)] + [act(user, 1, Permission.READ) for user in range(2, 7)]
    half_writers = [act(user, 2) for user in range(1, 4)] + [act(user, 2, Permission.READ) for user in range(4, 7)]

    entries = {entry.repo_id: entry for entry in compute_baseline(TEAM, mostly_readers + half_writers, NOW)}

    assert entries[1].proposed_role is Permission.READ
    assert entries[2].proposed_role is Permission.WRITE


def test_member_counted_once_with_highest_level() -> None:
    activity = [act(user, 1, Permission.READ) for user in range(1, 7)] + [act(user, 1) for user in range(1, 4)]

    (entry,) = compute_baseline(TEAM, activity, NOW)

    assert entry.active_members == 6
    assert entry.proposed_role is Permission.WRITE


def test_baseline_never_proposes_admin() -> None:
    activity = [act(user, 1, Permission.ADMIN) for user in range(1, 13)]

    assert compute_baseline(TEAM, activity, NOW) == []


def test_baseline_ignores_non_members_and_old_events() -> None:
    outsiders = [act(user, 1) for user in range(100, 110)]
    stale = [act(user, 1, days_ago=31) for user in range(1, 13)]

    assert compute_baseline(TEAM, outsiders + stale, NOW) == []


def test_empty_team_has_no_baseline() -> None:
    assert compute_baseline(set(), [act(1, 1)], NOW) == []
```

- [ ] **A1.2: Uruchom — RED.** Z `backend/`: `pytest tests/domain/test_baseline_rules.py -q` → `ModuleNotFoundError`.

- [ ] **A1.3: Zaimplementuj** `backend/app/domain/baseline_rules.py`:

```python
"""Standard zespołu (ADR 0005 §1, ADR 0007 §7). Czysta funkcja bez bazy."""

from collections import defaultdict
from collections.abc import Collection, Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain.enums import Permission
from app.domain.roles import rank


@dataclass(frozen=True)
class MemberActivity:
    user_id: int
    repo_id: int
    permission: Permission
    occurred_at: datetime


@dataclass(frozen=True)
class BaselineEntry:
    repo_id: int
    active_members: int
    proposed_role: Permission


def compute_baseline(
    member_ids: Collection[int], activity: Iterable[MemberActivity], now: datetime, window_days: int = 30
) -> list[BaselineEntry]:
    if not member_ids:
        return []
    window_start = now - timedelta(days=window_days)
    levels: dict[int, dict[int, Permission]] = defaultdict(dict)
    for item in activity:
        if item.user_id not in member_ids or item.permission is Permission.ADMIN:
            continue
        if not window_start <= item.occurred_at <= now:
            continue
        current = levels[item.repo_id].get(item.user_id)
        if current is None or rank(item.permission) > rank(current):
            levels[item.repo_id][item.user_id] = item.permission

    entries: list[BaselineEntry] = []
    for repo_id, member_levels in sorted(levels.items()):
        active = len(member_levels)
        if active * 2 < len(member_ids):
            continue
        writers = sum(1 for level in member_levels.values() if level is Permission.WRITE)
        role = Permission.WRITE if writers * 2 >= active else Permission.READ
        entries.append(BaselineEntry(repo_id=repo_id, active_members=active, proposed_role=role))
    return entries
```

- [ ] **A1.4: Uruchom — GREEN.** `pytest tests/domain/test_baseline_rules.py -q` → `6 passed`.

- [ ] **A1.5: Commit.** `git add backend/app/domain/baseline_rules.py backend/tests/domain/test_baseline_rules.py && git commit -m "feat(domain): add team baseline algorithm"`

---

## Część B — odczyt standardu (po Zadaniach 3 i 5)

### Krok B1: `get_team_baseline`

**Pliki:**
- Utwórz: `backend/app/services/baseline_service.py` (oraz `app/services/__init__.py`, `tests/services/__init__.py`, jeśli jeszcze nie istnieją — puste)
- Test: `backend/tests/services/test_baseline_service.py`

**Interfejsy:**
- Produkuje: `get_team_baseline(session, team: Team, now: datetime, window_days: int = 30) -> BaselineView`.

- [ ] **B1.1: Napisz testy** `backend/tests/services/test_baseline_service.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType, Permission, Team
from app.services.baseline_service import get_team_baseline
from tests.factories import make_event, make_repo, make_user

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def test_get_team_baseline_maps_repos_and_counts_members(session: AsyncSession) -> None:
    await make_user(session, "tomasz-admin", team=None, is_admin=True)
    devs = [await make_user(session, f"dev-{index}", team=Team.DEV) for index in range(4)]
    await make_user(session, "marta-qa", team=Team.QA)
    core = await make_repo(session, "core-api")
    docs = await make_repo(session, "docs-portal")
    for dev in devs[:2]:
        await make_event(session, dev, core, ActionType.PUSH, NOW - timedelta(days=1))
    await make_event(session, devs[0], docs, ActionType.ISSUE_COMMENT, NOW - timedelta(days=1))

    baseline = await get_team_baseline(session, Team.DEV, NOW)

    assert baseline.team is Team.DEV
    assert baseline.member_count == 4
    assert baseline.window_days == 30
    assert [(entry.repo.name, entry.active_members, entry.proposed_role) for entry in baseline.entries] == [
        ("core-api", 2, Permission.WRITE)
    ]
```

- [ ] **B1.2: Uruchom — RED.** `pytest tests/services/test_baseline_service.py -q` → `ModuleNotFoundError`.

- [ ] **B1.3: Zaimplementuj** `backend/app/services/baseline_service.py`:

```python
"""Serwis standardu zespołu i onboardingu (ADR 0007 §7)."""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.baseline_rules import MemberActivity, compute_baseline
from app.domain.enums import Team
from app.models import ActivityEvent, Repository, User
from app.schemas.api import BaselineEntryView, BaselineView, RepoRef


async def get_team_baseline(session: AsyncSession, team: Team, now: datetime, window_days: int = 30) -> BaselineView:
    members = (await session.scalars(select(User).where(User.team == team, User.is_admin.is_(False)))).all()
    member_ids = {member.id for member in members}
    events = await session.scalars(
        select(ActivityEvent).where(
            ActivityEvent.user_id.in_(member_ids),
            ActivityEvent.timestamp >= now - timedelta(days=window_days),
        )
    )
    activity = [MemberActivity(e.user_id, e.repo_id, e.required_permission, e.timestamp) for e in events]
    entries = compute_baseline(member_ids, activity, now, window_days)
    repos = {
        repo.id: repo
        for repo in await session.scalars(select(Repository).where(Repository.id.in_([e.repo_id for e in entries])))
    }
    views = [
        BaselineEntryView(
            repo=RepoRef.model_validate(repos[entry.repo_id]),
            active_members=entry.active_members,
            proposed_role=entry.proposed_role,
        )
        for entry in entries
    ]
    return BaselineView(
        team=team,
        member_count=len(members),
        window_days=window_days,
        entries=sorted(views, key=lambda view: view.repo.name),
    )
```

- [ ] **B1.4: Uruchom — GREEN.** `pytest tests/services/test_baseline_service.py -q` → `1 passed`.

- [ ] **B1.5: Commit.** `git add backend/app/services/baseline_service.py backend/tests/services/test_baseline_service.py && git commit -m "feat(services): add team baseline service"`

---

## Część C — onboarding (po Kroku 1 Zadania 10: `audit_service`, `errors`)

### Krok C1: `apply_baseline`

**Pliki:**
- Zmień: `backend/app/services/baseline_service.py`, `backend/tests/services/test_baseline_service.py`

**Interfejsy:**
- Konsumuje: `VCSProvider` (1), `write_audit_event` i `ServiceError` (10).
- Produkuje: `apply_baseline(session, vcs, *, team, login, now, actor_login) -> list[BaselineEntryView]` (zastosowane pozycje).

- [ ] **C1.1: Dopisz testy** na końcu `test_baseline_service.py` (rozszerz importy o `select`, `AuditLog`, `Lease`, `AuditAction`, `ServiceError`, `apply_baseline`, `make_lease`):

```python
class RecordingVCS:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str, Permission]] = []

    async def set_permission(self, owner: str, repo: str, username: str, permission: Permission) -> None:
        self.calls.append((owner, repo, username, permission))

    async def remove_collaborator(self, owner: str, repo: str, username: str) -> None:
        raise AssertionError("onboarding never removes access")


async def dev_team_with_two_baseline_repos(session: AsyncSession) -> None:
    devs = [await make_user(session, f"dev-{index}", team=Team.DEV) for index in range(3)]
    await make_user(session, "filip-dev", team=Team.DEV)
    for name in ("core-api", "frontend-app"):
        repo = await make_repo(session, name)
        for dev in devs[:2]:
            await make_event(session, dev, repo, ActionType.PUSH, NOW - timedelta(days=1))


async def test_apply_baseline_grants_missing_repos_and_audits(session: AsyncSession) -> None:
    await dev_team_with_two_baseline_repos(session)
    vcs = RecordingVCS()

    applied = await apply_baseline(session, vcs, team=Team.DEV, login="filip-dev", now=NOW, actor_login="tomasz-admin")

    assert [entry.repo.name for entry in applied] == ["core-api", "frontend-app"]
    assert vcs.calls == [
        ("longtails", "core-api", "filip-dev", Permission.WRITE),
        ("longtails", "frontend-app", "filip-dev", Permission.WRITE),
    ]
    audit = (await session.scalars(select(AuditLog))).all()
    assert [(row.action, row.actor_id, row.target) for row in audit] == [
        (AuditAction.BASELINE_APPLIED, "tomasz-admin", "DEV:filip-dev")
    ]


async def test_apply_baseline_skips_existing_access(session: AsyncSession) -> None:
    await dev_team_with_two_baseline_repos(session)
    filip = await session.scalar(select(User).where(User.login == "filip-dev"))
    core = await session.scalar(select(Repository).where(Repository.name == "core-api"))
    await make_lease(session, filip, core, Permission.READ, granted_at=NOW, expires_at=NOW + timedelta(days=30))
    vcs = RecordingVCS()

    applied = await apply_baseline(session, vcs, team=Team.DEV, login="filip-dev", now=NOW, actor_login="tomasz-admin")

    assert [entry.repo.name for entry in applied] == ["frontend-app"]


async def test_apply_baseline_rejects_user_from_other_team(session: AsyncSession) -> None:
    await dev_team_with_two_baseline_repos(session)
    await make_user(session, "marta-qa", team=Team.QA)

    with pytest.raises(ServiceError) as error:
        await apply_baseline(
            session, RecordingVCS(), team=Team.DEV, login="marta-qa", now=NOW, actor_login="tomasz-admin"
        )
    assert error.value.status_code == 422
    with pytest.raises(ServiceError) as missing:
        await apply_baseline(session, RecordingVCS(), team=Team.DEV, login="ghost", now=NOW, actor_login="tomasz-admin")
    assert missing.value.status_code == 404
```

Do importów dodaj też `from app.models import AuditLog, Repository, User`.

- [ ] **C1.2: Uruchom — RED.** `pytest tests/services/test_baseline_service.py -q` → `ImportError: cannot import name 'apply_baseline'`.

- [ ] **C1.3: Zaimplementuj.** W `baseline_service.py` rozszerz importy:

```python
from app.domain.enums import ActorType, AuditAction, Team
from app.models import ActivityEvent, Lease, Repository, User
from app.ports.vcs_provider import VCSProvider
from app.services.audit_service import write_audit_event
from app.services.errors import ServiceError
```

i dopisz:

```python
async def apply_baseline(
    session: AsyncSession, vcs: VCSProvider, *, team: Team, login: str, now: datetime, actor_login: str
) -> list[BaselineEntryView]:
    user = await session.scalar(select(User).where(User.login == login))
    if user is None:
        raise ServiceError(404, f"User {login} not found")
    if user.team is not team:
        raise ServiceError(422, f"User {login} is not a member of team {team}")

    baseline = await get_team_baseline(session, team, now)
    active_repo_ids = set(
        await session.scalars(select(Lease.repo_id).where(Lease.user_id == user.id, Lease.revoked_at.is_(None)))
    )
    applied = [entry for entry in baseline.entries if entry.repo.id not in active_repo_ids]
    for entry in applied:
        await vcs.set_permission(entry.repo.owner, entry.repo.name, login, entry.proposed_role)
    if applied:
        await write_audit_event(
            session,
            now=now,
            actor_type=ActorType.ADMIN,
            actor_id=actor_login,
            action=AuditAction.BASELINE_APPLIED,
            target=f"{team}:{login}",
            details=", ".join(f"{entry.repo.name}={entry.proposed_role}" for entry in applied),
        )
    return applied
```

- [ ] **C1.4: Uruchom — GREEN.** `pytest tests/services/test_baseline_service.py -q` → `4 passed`.

- [ ] **C1.5: Commit.** `git commit -am "feat(services): apply team baseline for onboarding"`

---

### Krok końcowy: Weryfikacja

- [ ] **V.1:** Z `backend/`: `pytest -q && ruff check . && ruff format --check .` → zielone.
- [ ] **V.2:** Na danych seeda (Zadanie 4) standard DEV zawiera `core-api` (8/12) i `frontend-app` (6/12), a nie zawiera `auth-service` (3/12). Sprawdź to szybkim testem ad hoc lub w Zadaniu 19.
- [ ] **V.3:** PR → `main`.
