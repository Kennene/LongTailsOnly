# Zadanie 4: Deterministyczne dane demonstracyjne — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecany) lub `superpowers:executing-plans`. Kroki używają checkboxów (`- [ ]`).

**Cel:** Deterministyczna populacja demo (1 org, `tomasz-admin`, DEV/QA, 10 repozytoriów, dostępy, `ActivityEvent`) wraz ze scenariuszami A–D, ładowana przez `seed_demo_data(session, now)`.

**Architektura:** Dwie warstwy:
1. `app/db/seed_data.py` — **czysty**, deklaratywny plan demo (`build_demo_plan() -> DemoPlan`), czyli krotki z offsetami w dniach. Nie zależy od bazy, więc testy scenariuszy i inwariantów działają, zanim Zadanie 3 trafi do `main`.
2. `app/db/seed.py` — cienki zapis planu do ORM względem wstrzykniętego `now`, idempotentny.

**Stack:** Python 3.14, SQLAlchemy 2.0 async, pytest + anyio.

**Spec:** plan główny — Zadanie 4; `PLAN.md` Faza 1 pkt 3; ADR 0002, ADR 0003, ADR 0006 §5, ADR 0007 §3 i §7.

**Branch:** `feat/task-04-demo-seed` (obecnie `feat/task-4-demo-seed`) · **Zależności:** Część A → 1; Część B → 3 · **Odblokowuje:** 6 (dane w dev), 11 (start aplikacji), 19

## Ograniczenia globalne

- Czas wyłącznie z argumentu `now` — zakaz `datetime.now()` w `app/` (ADR 0003).
- `expires_at` każdego dostępu nie-admin = ostatnie zdarzenie odnawiające (lub nadanie) + 30 dni (ADR 0007 §3).
- `admin` jest stały: `expires_at = None` (ADR 0002, ADR 0006 §5).
- Populacja: 15–25 kont, DEV ~12, QA ~6, 10 repozytoriów, 1 organizacja.
- Pliki ≤ 300 linii; jawne type hinty.

## Decyzje względem planu głównego

1. **Scenariusz A** realizuje wersję z `PLAN.md`/ADR 0002 (developer z `write`, który od 25 dni nie pushuje, a tylko recenzuje PR-y), a nie „developer z `admin`, który tylko pushuje” z planu głównego. Ten opis jest nieaktualny po rewizji ADR 0002 (ADR 0006, Kontekst).
2. **Sygnatura:** `seed_demo_data(session: AsyncSession, now: datetime) -> None` (wstrzyknięty czas zamiast `seed_demo_data(session)`).
3. **Scenariusz B** od startu jest w oknie ostrzegawczym (wygasa za 3 dni). Pitch zakłada „czysty dashboard”, więc offsety są stałymi w jednym miejscu i da się je przestroić.

## Review Focus

- **Spójność z regułą odnawiania:** dostęp, którego `expires_at` nie wynika z ostatniej aktywności, rozjedzie się z Zadaniem 8 po pierwszym zdarzeniu → test `test_lease_expiry_follows_last_renewing_activity`.
- **Zdarzenie bez dostępu:** aktywność nie-kolaboratora jest niespójna z mockiem GitHuba → test `test_every_event_belongs_to_a_leaseholder`.
- **Ostatni admin:** każde repo ma dokładnie jednego admina (warunek demo w Zadaniu 7) → test `test_admin_is_sole_permanent_admin_of_every_repo`.
- **Ponowny start aplikacji:** seed na niepustej bazie nie może duplikować danych → test `test_seed_is_idempotent`.
- **Zegar systemowy:** seed z datą z 2020 roku musi dać daty z 2020 roku → test `test_seed_uses_injected_now`.

## Struktura plików

| Plik | Odpowiedzialność |
| --- | --- |
| `backend/app/db/seed_data.py` | Stałe populacji, `LeaseSpec`, `EventSpec`, `DemoPlan`, `build_demo_plan()` |
| `backend/app/db/seed.py` | `seed_demo_data(session, now)` — zapis planu do ORM |
| `backend/tests/db/test_seed_data.py` | Testy czystego planu: populacja, inwarianty, scenariusze A–D |
| `backend/tests/db/test_seed.py` | Testy zapisu do bazy: populacja, idempotencja, wstrzyknięty czas |

---

## Część A — przed scaleniem Zadania 3 (wymaga tylko enumów z Zadania 1)

### Krok 0: Baza gałęzi

- [ ] **0.1: Ustaw bazę.** Jeśli Zadanie 1 jest już w `main`: `git fetch origin && git rebase origin/main`. Jeśli jest tylko na gałęzi kolegi: `git fetch origin && git rebase origin/feat/task-01-backend-skeleton` (stacked branch; po scaleniu Zadania 1 zrób `git rebase origin/main`).
- [ ] **0.2: Sprawdź kontrakt.** Z `backend/`: `python -c "from app.domain.enums import Permission, ActionType, Team, EVENT_PERMISSION; print('OK')"` → `OK`.

### Krok A1: Populacja i inwarianty planu

**Pliki:**
- Utwórz: `backend/app/db/__init__.py` (pusty — identyczny jak w Zadaniu 3, scali się bez konfliktu), `backend/tests/db/__init__.py` (pusty), `backend/app/db/seed_data.py`
- Test: `backend/tests/db/test_seed_data.py`

**Interfejsy:**
- Konsumuje: `Team`, `Permission`, `ActionType`, `EVENT_PERMISSION` (Zadanie 1).
- Produkuje: `DEMO_ORG`, `ADMIN_LOGIN`, `LEASE_DAYS`, `DEV_LOGINS`, `QA_LOGINS`, `REPO_NAMES`, `LeaseSpec`, `EventSpec`, `DemoPlan`, `build_demo_plan() -> DemoPlan`.

- [ ] **A1.1: Napisz testy** `backend/tests/db/test_seed_data.py`:

```python
from collections import Counter

from app.db.seed_data import ADMIN_LOGIN, DEMO_ORG, LEASE_DAYS, REPO_NAMES, DemoPlan, build_demo_plan
from app.domain.enums import EVENT_PERMISSION, ActionType, Permission, Team


def plan() -> DemoPlan:
    return build_demo_plan()


def test_plan_creates_demo_population() -> None:
    demo = plan()
    teams = Counter(team for _, team in demo.members)

    assert DEMO_ORG == "longtails"
    assert len(demo.repos) == 10
    assert teams[Team.DEV] == 12
    assert teams[Team.QA] == 6
    assert (ADMIN_LOGIN, None) in demo.members
    assert 15 <= len(demo.members) <= 25


def test_admin_is_sole_permanent_admin_of_every_repo() -> None:
    admin_leases = [lease for lease in plan().leases if lease.role is Permission.ADMIN]

    assert {lease.login for lease in admin_leases} == {ADMIN_LOGIN}
    assert sorted(lease.repo for lease in admin_leases) == sorted(REPO_NAMES)
    assert all(lease.expires_in_days is None for lease in admin_leases)


def test_lease_pairs_are_unique() -> None:
    pairs = [(lease.login, lease.repo) for lease in plan().leases]

    assert len(pairs) == len(set(pairs))


def test_every_event_belongs_to_a_leaseholder() -> None:
    demo = plan()
    lease_pairs = {(lease.login, lease.repo) for lease in demo.leases}

    assert demo.events
    assert all((event.login, event.repo) in lease_pairs for event in demo.events)


def test_no_event_is_in_the_future() -> None:
    assert all(event.days_ago >= 0 for event in plan().events)


def test_lease_expiry_follows_last_renewing_activity() -> None:
    demo = plan()
    for lease in demo.leases:
        if lease.role is Permission.ADMIN:
            continue
        renewing = [
            event.days_ago
            for event in demo.events
            if (event.login, event.repo) == (lease.login, lease.repo)
            and (EVENT_PERMISSION[event.action_type] is Permission.WRITE or lease.role is Permission.READ)
        ]
        last_renewal_days_ago = min([lease.granted_days_ago, *renewing])
        assert lease.expires_in_days == LEASE_DAYS - last_renewal_days_ago, lease


def test_dev_majority_pushes_core_api_within_window() -> None:
    demo = plan()
    dev_logins = {login for login, team in demo.members if team is Team.DEV}
    pushers = {
        event.login
        for event in demo.events
        if event.repo == "core-api" and event.action_type is ActionType.PUSH and event.days_ago <= LEASE_DAYS
    }

    assert len(pushers & dev_logins) * 2 >= len(dev_logins)
```

- [ ] **A1.2: Uruchom — RED.** Z `backend/`: `pytest tests/db/test_seed_data.py -q` → `ModuleNotFoundError: No module named 'app.db.seed_data'`.

- [ ] **A1.3: Zaimplementuj** `backend/app/db/seed_data.py`:

```python
"""Deklaratywny plan danych demo. Czas wyrażony jest w dniach względem `now` (ADR 0003)."""

from dataclasses import dataclass

from app.domain.enums import EVENT_PERMISSION, ActionType, Permission, Team

DEMO_ORG = "longtails"
ADMIN_LOGIN = "tomasz-admin"
LEASE_DAYS = 30

DEV_LOGINS = [
    "kamil-dev", "anna-dev", "piotr-dev", "ola-dev", "michal-dev", "kasia-dev",
    "bartek-dev", "ewa-dev", "jakub-dev", "zofia-dev", "adam-dev", "filip-dev",
]
QA_LOGINS = ["marta-qa", "lena-qa", "igor-qa", "nina-qa", "oskar-qa", "paula-qa"]
REPO_NAMES = [
    "core-api", "auth-service", "payment-gw", "frontend-app", "infra-terraform",
    "mobile-app", "data-pipeline", "docs-portal", "qa-automation", "legacy-billing",
]


@dataclass(frozen=True)
class LeaseSpec:
    login: str
    repo: str
    role: Permission
    granted_days_ago: int
    expires_in_days: int | None  # None = stała rola admin


@dataclass(frozen=True)
class EventSpec:
    login: str
    repo: str
    action_type: ActionType
    days_ago: int


@dataclass(frozen=True)
class DemoPlan:
    members: list[tuple[str, Team | None]]
    repos: list[str]
    leases: list[LeaseSpec]
    events: list[EventSpec]


def build_demo_plan() -> DemoPlan:
    leases = [LeaseSpec(ADMIN_LOGIN, repo, Permission.ADMIN, 365, None) for repo in REPO_NAMES]
    events: list[EventSpec] = []
    for logins, repo, action_type in _TEAM_ACTIVITY:
        team_leases, team_events = _team_activity(logins, repo, action_type)
        leases += team_leases
        events += team_events
    return DemoPlan(members=_members(), repos=list(REPO_NAMES), leases=leases, events=events)


# (członkowie, repo, typ zdarzenia) — regularna praca zespołów, sygnał dla baseline'u (ADR 0007 §7)
_TEAM_ACTIVITY: list[tuple[list[str], str, ActionType]] = [
    (DEV_LOGINS[:8], "core-api", ActionType.PUSH),  # 8/12 DEV -> baseline write
    (DEV_LOGINS[:6], "frontend-app", ActionType.PUSH),  # 6/12 DEV -> dokładnie próg 50%
    (DEV_LOGINS[8:11], "auth-service", ActionType.PUSH),  # 3/12 DEV -> poniżej progu
    (DEV_LOGINS[9:11], "infra-terraform", ActionType.PUSH),
    (QA_LOGINS[1:5], "core-api", ActionType.ISSUE_COMMENT),  # 4/6 QA -> baseline read
    (QA_LOGINS[1:4], "qa-automation", ActionType.PUSH),
    (QA_LOGINS[4:6], "docs-portal", ActionType.PR_REVIEW),
]


def _members() -> list[tuple[str, Team | None]]:
    return [
        (ADMIN_LOGIN, None),
        *((login, Team.DEV) for login in DEV_LOGINS),
        *((login, Team.QA) for login in QA_LOGINS),
    ]


def _team_activity(logins: list[str], repo: str, action_type: ActionType) -> tuple[list[LeaseSpec], list[EventSpec]]:
    """Dostęp nadany 60 dni temu i odnowiony ostatnim zdarzeniem (+30 dni)."""
    role = EVENT_PERMISSION[action_type]
    leases: list[LeaseSpec] = []
    events: list[EventSpec] = []
    for index, login in enumerate(logins):
        days_ago = 1 + index % 5
        leases.append(LeaseSpec(login, repo, role, 60, LEASE_DAYS - days_ago))
        events.append(EventSpec(login, repo, action_type, days_ago))
    return leases, events
```

- [ ] **A1.4: Uruchom — GREEN.** `pytest tests/db/test_seed_data.py -q` → `7 passed`.

- [ ] **A1.5: Commit.** `git add backend/app/db/__init__.py backend/app/db/seed_data.py backend/tests/db && git commit -m "feat(seed): add declarative demo population plan"`

### Krok A2: Scenariusze A–D

**Pliki:**
- Zmień: `backend/app/db/seed_data.py`, `backend/tests/db/test_seed_data.py`

**Interfejsy:**
- Produkuje dla Zadań 8, 10, 16, 19: `SCENARIO_A_LOGIN`, `SCENARIO_A_REPO`, `SCENARIO_B_LOGIN`, `SCENARIO_B_REPO`, `SCENARIO_C_REPO`, `SCENARIO_D_LOGIN`.

| Scenariusz | Dane |
| --- | --- |
| A | `kamil-dev` / `payment-gw`: `write`, nadany 25 dni temu (wygasa za 5); bez `PushEvent`; `PullRequestReviewEvent` 3 dni temu, `IssueCommentEvent` 6 dni temu → rekomendacja `DOWNSCOPE` |
| B | `marta-qa` / `qa-automation`: `write`, `PushEvent` 27 dni temu → wygasa za 3 dni (`WARNING`) |
| C | `legacy-billing`: `piotr-dev` (`write`) i `lena-qa` (`read`), nadane 45 dni temu → wygasłe 15 dni temu; zero zdarzeń → `REVOKE` |
| D | `filip-dev` (DEV): zero dostępów i zdarzeń → kandydat do onboardingu z baseline'u |

- [ ] **A2.1: Dopisz testy.** Rozszerz import w `test_seed_data.py` o `SCENARIO_A_LOGIN, SCENARIO_A_REPO, SCENARIO_B_LOGIN, SCENARIO_B_REPO, SCENARIO_C_REPO, SCENARIO_D_LOGIN` i dopisz:

```python
def test_scenario_a_writer_only_reviews_without_push() -> None:
    demo = plan()
    lease = next(item for item in demo.leases if (item.login, item.repo) == (SCENARIO_A_LOGIN, SCENARIO_A_REPO))
    events = [item for item in demo.events if (item.login, item.repo) == (SCENARIO_A_LOGIN, SCENARIO_A_REPO)]

    assert lease.role is Permission.WRITE
    assert lease.granted_days_ago == 25
    assert {event.action_type for event in events} == {ActionType.PR_REVIEW, ActionType.ISSUE_COMMENT}


def test_scenario_b_qa_lease_expires_in_three_days() -> None:
    demo = plan()
    lease = next(item for item in demo.leases if (item.login, item.repo) == (SCENARIO_B_LOGIN, SCENARIO_B_REPO))

    assert (SCENARIO_B_LOGIN, Team.QA) in demo.members
    assert lease.expires_in_days == 3


def test_scenario_c_unused_repo_has_only_expired_leases_and_no_events() -> None:
    demo = plan()
    leases = [item for item in demo.leases if item.repo == SCENARIO_C_REPO and item.role is not Permission.ADMIN]

    assert leases
    assert all(item.expires_in_days is not None and item.expires_in_days <= 0 for item in leases)
    assert not [item for item in demo.events if item.repo == SCENARIO_C_REPO]


def test_scenario_d_new_developer_has_no_access() -> None:
    demo = plan()

    assert (SCENARIO_D_LOGIN, Team.DEV) in demo.members
    assert not [item for item in demo.leases if item.login == SCENARIO_D_LOGIN]
    assert not [item for item in demo.events if item.login == SCENARIO_D_LOGIN]
```

- [ ] **A2.2: Uruchom — RED.** `pytest tests/db/test_seed_data.py -q` → `ImportError: cannot import name 'SCENARIO_A_LOGIN'`.

- [ ] **A2.3: Zaimplementuj.** W `seed_data.py` pod `REPO_NAMES` dodaj:

```python
SCENARIO_A_LOGIN, SCENARIO_A_REPO = "kamil-dev", "payment-gw"
SCENARIO_B_LOGIN, SCENARIO_B_REPO = "marta-qa", "qa-automation"
SCENARIO_C_REPO = "legacy-billing"
SCENARIO_D_LOGIN = "filip-dev"
```

W `build_demo_plan` przed `return` dodaj `_scenarios(leases, events)`, a pod `_team_activity` dopisz:

```python
def _scenarios(leases: list[LeaseSpec], events: list[EventSpec]) -> None:
    # A: write bez pushy od 25 dni, tylko review/komentarze -> rekomendacja DOWNSCOPE
    leases.append(LeaseSpec(SCENARIO_A_LOGIN, SCENARIO_A_REPO, Permission.WRITE, 25, LEASE_DAYS - 25))
    events.append(EventSpec(SCENARIO_A_LOGIN, SCENARIO_A_REPO, ActionType.PR_REVIEW, 3))
    events.append(EventSpec(SCENARIO_A_LOGIN, SCENARIO_A_REPO, ActionType.ISSUE_COMMENT, 6))
    # B: QA, ostatni push 27 dni temu -> wygasa za 3 dni (okno ostrzegawcze)
    leases.append(LeaseSpec(SCENARIO_B_LOGIN, SCENARIO_B_REPO, Permission.WRITE, 27, LEASE_DAYS - 27))
    events.append(EventSpec(SCENARIO_B_LOGIN, SCENARIO_B_REPO, ActionType.PUSH, 27))
    # C: nieużywane repo -> dostępy wygasłe, brak zdarzeń
    leases.append(LeaseSpec("piotr-dev", SCENARIO_C_REPO, Permission.WRITE, 45, LEASE_DAYS - 45))
    leases.append(LeaseSpec("lena-qa", SCENARIO_C_REPO, Permission.READ, 45, LEASE_DAYS - 45))
    # D: SCENARIO_D_LOGIN celowo bez dostępów i zdarzeń
```

- [ ] **A2.4: Uruchom — GREEN.** `pytest tests/db/test_seed_data.py -q` → `11 passed` (inwarianty z A1 nadal zielone).

- [ ] **A2.5: Commit.** `git commit -am "feat(seed): add demo scenarios A-D"`

---

## Część B — po scaleniu Zadania 3

### Krok B0: Rebase na modele

- [ ] **B0.1:** `git fetch origin && git rebase origin/main` (albo `origin/feat/task-03-orm-models`, jeśli jeszcze nie scalone).
- [ ] **B0.2:** Z `backend/`: `pytest -q` → zielone; `python -c "from tests.factories import make_user; from app.db.session import init_db; print('OK')"` → `OK`.

### Krok B1: Zapis do bazy

**Pliki:**
- Utwórz: `backend/app/db/seed.py`
- Test: `backend/tests/db/test_seed.py`

**Interfejsy:**
- Konsumuje: `User`, `Repository`, `Lease`, `ActivityEvent` (Zadanie 3), fixture `session` (Zadanie 3), `build_demo_plan` (A1).
- Produkuje: `seed_demo_data(session: AsyncSession, now: datetime) -> None` (Zadania 11, 19).

- [ ] **B1.1: Napisz testy** `backend/tests/db/test_seed.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.seed import seed_demo_data
from app.db.seed_data import ADMIN_LOGIN, DEMO_ORG, SCENARIO_B_LOGIN, SCENARIO_B_REPO
from app.domain.enums import Permission
from app.models import ActivityEvent, Lease, Repository, User

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
MODELS = (User, Repository, Lease, ActivityEvent)


async def counts(session: AsyncSession) -> list[int]:
    return [await session.scalar(select(func.count()).select_from(model)) for model in MODELS]


async def lease_of(session: AsyncSession, login: str, repo: str) -> Lease:
    return await session.scalar(
        select(Lease).join(User, Lease.user_id == User.id).join(Repository, Lease.repo_id == Repository.id)
        .where(User.login == login, Repository.name == repo)
    )


async def test_seed_creates_demo_population(session: AsyncSession) -> None:
    await seed_demo_data(session, NOW)

    owners = (await session.scalars(select(Repository.owner).distinct())).all()
    admin = await session.scalar(select(User).where(User.login == ADMIN_LOGIN))
    admin_leases = (await session.scalars(select(Lease).where(Lease.current_role == Permission.ADMIN))).all()

    assert owners == [DEMO_ORG]
    assert admin.is_admin and admin.team is None
    assert len(admin_leases) == 10
    assert all(lease.expires_at is None for lease in admin_leases)
    assert (await counts(session))[3] > 0


async def test_seed_is_idempotent(session: AsyncSession) -> None:
    await seed_demo_data(session, NOW)
    before = await counts(session)

    await seed_demo_data(session, NOW)

    assert await counts(session) == before


async def test_seed_uses_injected_now(session: AsyncSession) -> None:
    past = datetime(2020, 1, 1, 12, 0, tzinfo=UTC)

    await seed_demo_data(session, past)

    lease = await lease_of(session, SCENARIO_B_LOGIN, SCENARIO_B_REPO)
    timestamps = (await session.scalars(select(ActivityEvent.timestamp))).all()
    assert lease.expires_at == past + timedelta(days=3)
    assert max(timestamps) <= past
```

- [ ] **B1.2: Uruchom — RED.** `pytest tests/db/test_seed.py -q` → `ModuleNotFoundError: No module named 'app.db.seed'`.

- [ ] **B1.3: Zaimplementuj** `backend/app/db/seed.py`:

```python
"""Zapis planu demo do bazy. Idempotentny: drugi przebieg nic nie zmienia."""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.seed_data import ADMIN_LOGIN, DEMO_ORG, LEASE_DAYS, build_demo_plan
from app.domain.enums import EVENT_PERMISSION
from app.models import ActivityEvent, Lease, Repository, User


async def seed_demo_data(session: AsyncSession, now: datetime) -> None:
    if await session.scalar(select(User.id).where(User.login == ADMIN_LOGIN)) is not None:
        return

    plan = build_demo_plan()
    users = {
        login: User(login=login, name=login.split("-")[0].capitalize(), team=team, is_admin=login == ADMIN_LOGIN)
        for login, team in plan.members
    }
    repos = {name: Repository(name=name, owner=DEMO_ORG, default_lease_days=LEASE_DAYS) for name in plan.repos}
    session.add_all([*users.values(), *repos.values()])
    await session.flush()

    session.add_all(
        Lease(
            user_id=users[spec.login].id,
            repo_id=repos[spec.repo].id,
            current_role=spec.role,
            granted_at=now - timedelta(days=spec.granted_days_ago),
            expires_at=None if spec.expires_in_days is None else now + timedelta(days=spec.expires_in_days),
        )
        for spec in plan.leases
    )
    session.add_all(
        ActivityEvent(
            user_id=users[spec.login].id,
            repo_id=repos[spec.repo].id,
            timestamp=now - timedelta(days=spec.days_ago),
            action_type=spec.action_type,
            required_permission=EVENT_PERMISSION[spec.action_type],
        )
        for spec in plan.events
    )
    await session.commit()
```

- [ ] **B1.4: Uruchom — GREEN.** `pytest tests/db/test_seed.py -q` → `3 passed`.

- [ ] **B1.5: Commit.** `git add backend/app/db/seed.py backend/tests/db/test_seed.py && git commit -m "feat(seed): persist demo plan to database"`

---

### Krok końcowy: Weryfikacja

- [ ] **V.1:** Z `backend/`: `pytest -q && ruff check . && ruff format --check .` → zielone.
- [ ] **V.2:** `wc -l app/db/seed*.py tests/db/test_seed*.py` → każdy ≤ 300.
- [ ] **V.3:** `grep -nE "datetime\.(now|utcnow)" app/db/seed*.py` → brak wyników.
- [ ] **V.4:** PR → `main`; w opisie wypisz „Decyzje względem planu głównego”.
