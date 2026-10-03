# Zadanie 8: Cykl życia dzierżawy i asymetryczne odnawianie — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecany) lub `superpowers:executing-plans`. Kroki używają checkboxów (`- [ ]`).

**Cel:** Reguły ADR 0007 §1–3 (status, `days_remaining`, rekomendacja, odnawianie) jako czyste funkcje oraz serwis `lease_service`, który zapisuje aktywność i buduje `LeaseView` dla API.

**Architektura:** `app/domain/lease_rules.py` nie zna bazy ani FastAPI. Operuje na enumach, datach i `ActivityFact`, więc Część A można robić po samym Zadaniu 1. `app/services/lease_service.py` (Część B) mapuje rekordy ORM na fakty i DTO. Status liczony jest z zapisanego `expires_at`, a rekomendacja ze zdarzeń w oknie `lease_days`.

**Stack:** Python 3.14 stdlib; SQLAlchemy async (Część B).

**Spec:** ADR 0002; ADR 0007 §1–3; ADR 0006 §7 (`LeaseView`); plan główny — Zadanie 8. Testy `test_push_does_not_renew_admin_lease` i `test_admin_activity_renews_admin_lease` z planu głównego są nieaktualne (admin jest stały) — zastępują je `test_read_activity_does_not_renew_write_lease` i `test_admin_lease_is_permanent`.

**Branch:** `feat/task-08-lease-lifecycle` · **Zależności:** Część A → 1 (+ `covers` z Zadania 5); Część B → 3, 5 · **Odblokowuje:** 10, 11

## Ograniczenia globalne

- `WARNING` ⇔ `0 < expires_at - now <= 7 dni`; `EXPIRED` ⇔ `expires_at - now <= 0` (ADR 0007 §1).
- `days_remaining = ceil((expires_at - now) / 1 dzień)`, może być ujemne; `None` dla `PERMANENT` i `REVOKED`.
- Zdarzenie `read` nie odnawia `write`; odnowienie nigdy nie skraca dzierżawy (`max`).
- Brak `datetime.now()` — `now` i `occurred_at` są argumentami.

## Review Focus

- **Granice 7 i 0 dni:** dokładnie 7 dni → `WARNING`, dokładnie 0 → `EXPIRED` → test `test_status_active_warning_expired_boundaries`.
- **Skrócenie przedłużonej dzierżawy:** zdarzenie po decyzji admina „+90 dni” nie może cofnąć `expires_at` → test `test_renewal_never_shortens_extended_lease`.
- **Zdarzenie spoza okna:** push sprzed 31 dni nie chroni `write` → test `test_no_recent_activity_recommends_revoke`.
- **Zdarzenia „z przyszłości” po cofnięciu zegara:** ignorowane w rekomendacji i ostatniej aktywności → test `test_future_events_are_ignored`.
- **Odebrana dzierżawa:** status `REVOKED`, rekomendacja `KEEP`, bez odnawiania → test `test_revoked_lease_is_inert`.

---

## Część A — czyste reguły (po Zadaniu 1; `covers` z Zadania 5 albo stacked branch)

### Krok A1: Status i pozostałe dni

**Pliki:**
- Utwórz: `backend/app/domain/lease_rules.py`
- Test: `backend/tests/domain/test_lease_rules.py`

**Interfejsy:**
- Produkuje: `ActivityFact(action_type, permission, occurred_at)`, `evaluate_status(role, expires_at, revoked_at, now, warning_days=7) -> LeaseStatus`, `days_remaining(role, expires_at, revoked_at, now) -> int | None`.

- [ ] **A1.1: Napisz testy** `backend/tests/domain/test_lease_rules.py`:

```python
from datetime import UTC, datetime, timedelta

from app.domain.enums import LeaseStatus, Permission
from app.domain.lease_rules import days_remaining, evaluate_status

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
WRITE, READ, ADMIN = Permission.WRITE, Permission.READ, Permission.ADMIN


def status_in(delta: timedelta) -> LeaseStatus:
    return evaluate_status(WRITE, NOW + delta, None, NOW)


def test_status_active_warning_expired_boundaries() -> None:
    assert status_in(timedelta(days=7, seconds=1)) is LeaseStatus.ACTIVE
    assert status_in(timedelta(days=7)) is LeaseStatus.WARNING
    assert status_in(timedelta(seconds=1)) is LeaseStatus.WARNING
    assert status_in(timedelta(0)) is LeaseStatus.EXPIRED
    assert status_in(timedelta(days=-15)) is LeaseStatus.EXPIRED


def test_admin_lease_is_permanent() -> None:
    assert evaluate_status(ADMIN, None, None, NOW) is LeaseStatus.PERMANENT
    assert days_remaining(ADMIN, None, None, NOW) is None


def test_revoked_status_wins() -> None:
    assert evaluate_status(WRITE, NOW + timedelta(days=20), NOW, NOW) is LeaseStatus.REVOKED
    assert evaluate_status(ADMIN, None, NOW, NOW) is LeaseStatus.REVOKED


def test_days_remaining_rounds_up_and_goes_negative() -> None:
    assert days_remaining(WRITE, NOW + timedelta(days=3), None, NOW) == 3
    assert days_remaining(WRITE, NOW + timedelta(days=2, hours=1), None, NOW) == 3
    assert days_remaining(READ, NOW - timedelta(days=15), None, NOW) == -15
    assert days_remaining(WRITE, NOW + timedelta(days=3), NOW, NOW) is None
```

- [ ] **A1.2: Uruchom — RED.** Z `backend/`: `pytest tests/domain/test_lease_rules.py -q` → `ModuleNotFoundError`.

- [ ] **A1.3: Zaimplementuj** `backend/app/domain/lease_rules.py`:

```python
"""Reguły dzierżawy z ADR 0007 §1–3. Czyste funkcje: bez bazy i bez zegara systemowego."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from math import ceil

from app.domain.enums import ActionType, LeaseStatus, Permission, Recommendation
from app.domain.roles import covers

DAY = timedelta(days=1)


@dataclass(frozen=True)
class ActivityFact:
    action_type: ActionType
    permission: Permission
    occurred_at: datetime


def evaluate_status(
    role: Permission, expires_at: datetime | None, revoked_at: datetime | None, now: datetime, warning_days: int = 7
) -> LeaseStatus:
    if revoked_at is not None:
        return LeaseStatus.REVOKED
    if role is Permission.ADMIN or expires_at is None:
        return LeaseStatus.PERMANENT
    remaining = expires_at - now
    if remaining <= timedelta(0):
        return LeaseStatus.EXPIRED
    if remaining <= timedelta(days=warning_days):
        return LeaseStatus.WARNING
    return LeaseStatus.ACTIVE


def days_remaining(
    role: Permission, expires_at: datetime | None, revoked_at: datetime | None, now: datetime
) -> int | None:
    if revoked_at is not None or role is Permission.ADMIN or expires_at is None:
        return None
    return ceil((expires_at - now) / DAY)
```

- [ ] **A1.4: Uruchom — GREEN.** `pytest tests/domain/test_lease_rules.py -q` → `4 passed`.

- [ ] **A1.5: Commit.** `git add backend/app/domain/lease_rules.py backend/tests/domain/test_lease_rules.py && git commit -m "feat(domain): add lease status evaluation"`

### Krok A2: Rekomendacja, odnawianie, ostatnia aktywność

**Pliki:**
- Zmień: `backend/app/domain/lease_rules.py`, `backend/tests/domain/test_lease_rules.py`

**Interfejsy:**
- Produkuje: `recommend(role, revoked_at, facts, now, lease_days) -> Recommendation`, `renewed_expiry(role, expires_at, revoked_at, event_permission, occurred_at, lease_days) -> datetime | None` (`None` = brak zmiany), `last_activity(facts, now) -> ActivityFact | None`.

- [ ] **A2.1: Dopisz testy.** Rozszerz import o `ActivityFact, last_activity, recommend, renewed_expiry` oraz `ActionType`, `Recommendation`, a następnie dopisz:

```python
def fact(action_type: ActionType, days_ago: float) -> ActivityFact:
    permission = WRITE if action_type is ActionType.PUSH else READ
    return ActivityFact(action_type, permission, NOW - timedelta(days=days_ago))


def test_recent_push_keeps_write() -> None:
    assert recommend(WRITE, None, [fact(ActionType.PUSH, 2)], NOW, 30) is Recommendation.KEEP


def test_recent_lower_role_activity_recommends_downscope() -> None:
    facts = [fact(ActionType.PR_REVIEW, 3), fact(ActionType.ISSUE_COMMENT, 6)]

    assert recommend(WRITE, None, facts, NOW, 30) is Recommendation.DOWNSCOPE


def test_no_recent_activity_recommends_revoke() -> None:
    assert recommend(WRITE, None, [], NOW, 30) is Recommendation.REVOKE
    assert recommend(WRITE, None, [fact(ActionType.PUSH, 31)], NOW, 30) is Recommendation.REVOKE
    assert recommend(READ, None, [], NOW, 30) is Recommendation.REVOKE


def test_read_lease_with_read_activity_is_kept() -> None:
    assert recommend(READ, None, [fact(ActionType.ISSUE_COMMENT, 1)], NOW, 30) is Recommendation.KEEP


def test_read_activity_does_not_renew_write_lease() -> None:
    expires = NOW + timedelta(days=2)

    assert renewed_expiry(WRITE, expires, None, READ, NOW, 30) is None
    assert renewed_expiry(READ, expires, None, READ, NOW, 30) == NOW + timedelta(days=30)


def test_write_activity_renews_write_and_read() -> None:
    expires = NOW + timedelta(days=2)

    assert renewed_expiry(WRITE, expires, None, WRITE, NOW, 30) == NOW + timedelta(days=30)
    assert renewed_expiry(READ, expires, None, WRITE, NOW, 30) == NOW + timedelta(days=30)


def test_renewal_never_shortens_extended_lease() -> None:
    extended = NOW + timedelta(days=90)

    assert renewed_expiry(WRITE, extended, None, WRITE, NOW, 30) == extended


def test_revoked_lease_is_inert() -> None:
    assert renewed_expiry(WRITE, NOW, NOW, WRITE, NOW, 30) is None
    assert recommend(WRITE, NOW, [], NOW, 30) is Recommendation.KEEP


def test_admin_is_never_renewed_or_downscoped() -> None:
    assert renewed_expiry(ADMIN, None, None, WRITE, NOW, 30) is None
    assert recommend(ADMIN, None, [], NOW, 30) is Recommendation.KEEP


def test_future_events_are_ignored() -> None:
    future = ActivityFact(ActionType.PUSH, WRITE, NOW + timedelta(days=1))
    past = fact(ActionType.PR_REVIEW, 2)

    assert recommend(WRITE, None, [future], NOW, 30) is Recommendation.REVOKE
    assert last_activity([future, past], NOW) == past
    assert last_activity([], NOW) is None
```

- [ ] **A2.2: Uruchom — RED.** `pytest tests/domain/test_lease_rules.py -q` → `ImportError: cannot import name 'recommend'`.

- [ ] **A2.3: Zaimplementuj.** Dopisz w `lease_rules.py`:

```python
def recommend(
    role: Permission, revoked_at: datetime | None, facts: Sequence[ActivityFact], now: datetime, lease_days: int
) -> Recommendation:
    if revoked_at is not None or role is Permission.ADMIN:
        return Recommendation.KEEP
    window_start = now - timedelta(days=lease_days)
    recent = [item for item in facts if window_start <= item.occurred_at <= now]
    if any(covers(item.permission, role) for item in recent):
        return Recommendation.KEEP
    if role is Permission.WRITE and recent:
        return Recommendation.DOWNSCOPE
    return Recommendation.REVOKE


def renewed_expiry(
    role: Permission,
    expires_at: datetime | None,
    revoked_at: datetime | None,
    event_permission: Permission,
    occurred_at: datetime,
    lease_days: int,
) -> datetime | None:
    if revoked_at is not None or role is Permission.ADMIN or expires_at is None:
        return None
    if not covers(event_permission, role):
        return None
    return max(expires_at, occurred_at + timedelta(days=lease_days))


def last_activity(facts: Sequence[ActivityFact], now: datetime) -> ActivityFact | None:
    past = [item for item in facts if item.occurred_at <= now]
    return max(past, key=lambda item: item.occurred_at, default=None)
```

- [ ] **A2.4: Uruchom — GREEN.** `pytest tests/domain/test_lease_rules.py -q` → `14 passed`.

- [ ] **A2.5: Commit.** `git commit -am "feat(domain): add lease recommendation and renewal rules"`

---

## Część B — serwis (po Zadaniach 3 i 5)

### Krok B1: `record_activity` i `LeaseView`

**Pliki:**
- Utwórz: `backend/app/services/__init__.py`, `backend/app/services/lease_service.py`, `backend/tests/services/__init__.py`
- Test: `backend/tests/services/test_lease_service.py`

**Interfejsy:**
- Konsumuje: modele (3), `LeaseView`, `UserRef`, `RepoRef` (5), reguły z Części A.
- Produkuje: `record_activity(session, *, user_id, repo_id, action_type, occurred_at) -> ActivityEvent`, `list_lease_views(session, now, warning_days=7) -> list[LeaseView]`, `get_lease_view(session, lease_id, now, warning_days=7) -> LeaseView | None`, `to_lease_view(lease, facts, now, warning_days=7) -> LeaseView`, `load_facts(session, *, user_id=None, repo_id=None) -> dict[tuple[int, int], list[ActivityFact]]`.

- [ ] **B1.1: Napisz testy** `backend/tests/services/test_lease_service.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType, LeaseStatus, Permission, Recommendation
from app.models import ActivityEvent
from app.services.lease_service import get_lease_view, list_lease_views, record_activity
from tests.factories import make_event, make_lease, make_repo, make_user

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def test_record_activity_persists_event_and_renews_matching_lease(session: AsyncSession) -> None:
    user = await make_user(session, "kamil-dev")
    repo = await make_repo(session, "core-api")
    lease = await make_lease(
        session, user, repo, Permission.WRITE, granted_at=NOW - timedelta(days=28), expires_at=NOW + timedelta(days=2)
    )

    event = await record_activity(
        session, user_id=user.id, repo_id=repo.id, action_type=ActionType.PUSH, occurred_at=NOW
    )

    assert event.required_permission is Permission.WRITE
    assert lease.expires_at == NOW + timedelta(days=30)


async def test_record_activity_with_read_event_keeps_write_expiry(session: AsyncSession) -> None:
    user = await make_user(session, "kamil-dev")
    repo = await make_repo(session, "payment-gw")
    lease = await make_lease(
        session, user, repo, Permission.WRITE, granted_at=NOW - timedelta(days=25), expires_at=NOW + timedelta(days=5)
    )

    await record_activity(session, user_id=user.id, repo_id=repo.id, action_type=ActionType.PR_REVIEW, occurred_at=NOW)

    assert lease.expires_at == NOW + timedelta(days=5)
    assert await session.scalar(select(func.count()).select_from(ActivityEvent)) == 1


async def test_record_activity_without_lease_only_records(session: AsyncSession) -> None:
    user = await make_user(session, "filip-dev")
    repo = await make_repo(session, "core-api")

    event = await record_activity(
        session, user_id=user.id, repo_id=repo.id, action_type=ActionType.ISSUE_COMMENT, occurred_at=NOW
    )

    assert event.id is not None


async def test_list_lease_views_reports_status_recommendation_and_last_activity(session: AsyncSession) -> None:
    kamil = await make_user(session, "kamil-dev")
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    repo = await make_repo(session, "payment-gw")
    lease = await make_lease(
        session, kamil, repo, Permission.WRITE, granted_at=NOW - timedelta(days=25), expires_at=NOW + timedelta(days=5)
    )
    await make_lease(session, admin, repo, Permission.ADMIN, granted_at=NOW - timedelta(days=365), expires_at=None)
    await make_event(session, kamil, repo, ActionType.ISSUE_COMMENT, NOW - timedelta(days=6))
    await make_event(session, kamil, repo, ActionType.PR_REVIEW, NOW - timedelta(days=3))

    views = await list_lease_views(session, NOW)
    single = await get_lease_view(session, lease.id, NOW)

    by_login = {view.user.login: view for view in views}
    assert by_login["kamil-dev"].status is LeaseStatus.WARNING
    assert by_login["kamil-dev"].days_remaining == 5
    assert by_login["kamil-dev"].recommendation is Recommendation.DOWNSCOPE
    assert by_login["kamil-dev"].last_activity_type is ActionType.PR_REVIEW
    assert by_login["kamil-dev"].last_activity_at == NOW - timedelta(days=3)
    assert by_login["tomasz-admin"].status is LeaseStatus.PERMANENT
    assert by_login["tomasz-admin"].recommendation is Recommendation.KEEP
    assert single == by_login["kamil-dev"]
    assert await get_lease_view(session, 999, NOW) is None
```

- [ ] **B1.2: Uruchom — RED.** `pytest tests/services/test_lease_service.py -q` → `ModuleNotFoundError`.

- [ ] **B1.3: Zaimplementuj** `backend/app/services/lease_service.py` (oraz puste `app/services/__init__.py`, `tests/services/__init__.py`):

```python
"""Serwis dzierżaw: zapis aktywności i budowa widoków (ADR 0007 §1–3)."""

from collections import defaultdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import EVENT_PERMISSION, ActionType
from app.domain.lease_rules import (
    ActivityFact,
    days_remaining,
    evaluate_status,
    last_activity,
    recommend,
    renewed_expiry,
)
from app.models import ActivityEvent, Lease
from app.schemas.api import LeaseView, RepoRef, UserRef

FactsByPair = dict[tuple[int, int], list[ActivityFact]]


async def record_activity(
    session: AsyncSession, *, user_id: int, repo_id: int, action_type: ActionType, occurred_at: datetime
) -> ActivityEvent:
    permission = EVENT_PERMISSION[action_type]
    event = ActivityEvent(
        user_id=user_id, repo_id=repo_id, timestamp=occurred_at, action_type=action_type, required_permission=permission
    )
    session.add(event)
    lease = await session.scalar(select(Lease).where(Lease.user_id == user_id, Lease.repo_id == repo_id))
    if lease is not None:
        new_expiry = renewed_expiry(
            lease.current_role, lease.expires_at, lease.revoked_at, permission, occurred_at,
            lease.repo.default_lease_days,
        )
        if new_expiry is not None:
            lease.expires_at = new_expiry
    await session.flush()
    return event


async def load_facts(session: AsyncSession, *, user_id: int | None = None, repo_id: int | None = None) -> FactsByPair:
    query = select(ActivityEvent)
    if user_id is not None:
        query = query.where(ActivityEvent.user_id == user_id)
    if repo_id is not None:
        query = query.where(ActivityEvent.repo_id == repo_id)
    facts: FactsByPair = defaultdict(list)
    for event in await session.scalars(query):
        facts[(event.user_id, event.repo_id)].append(
            ActivityFact(event.action_type, event.required_permission, event.timestamp)
        )
    return facts


def to_lease_view(lease: Lease, facts: list[ActivityFact], now: datetime, warning_days: int = 7) -> LeaseView:
    latest = last_activity(facts, now)
    return LeaseView(
        id=lease.id,
        user=UserRef.model_validate(lease.user),
        repo=RepoRef.model_validate(lease.repo),
        role=lease.current_role,
        granted_at=lease.granted_at,
        expires_at=lease.expires_at,
        days_remaining=days_remaining(lease.current_role, lease.expires_at, lease.revoked_at, now),
        status=evaluate_status(lease.current_role, lease.expires_at, lease.revoked_at, now, warning_days),
        recommendation=recommend(lease.current_role, lease.revoked_at, facts, now, lease.repo.default_lease_days),
        last_activity_at=latest.occurred_at if latest else None,
        last_activity_type=latest.action_type if latest else None,
    )


async def list_lease_views(session: AsyncSession, now: datetime, warning_days: int = 7) -> list[LeaseView]:
    leases = (await session.scalars(select(Lease).order_by(Lease.id))).all()
    facts = await load_facts(session)
    return [to_lease_view(lease, facts.get((lease.user_id, lease.repo_id), []), now, warning_days) for lease in leases]


async def get_lease_view(
    session: AsyncSession, lease_id: int, now: datetime, warning_days: int = 7
) -> LeaseView | None:
    lease = await session.get(Lease, lease_id)
    if lease is None:
        return None
    facts = await load_facts(session, user_id=lease.user_id, repo_id=lease.repo_id)
    return to_lease_view(lease, facts.get((lease.user_id, lease.repo_id), []), now, warning_days)
```

- [ ] **B1.4: Uruchom — GREEN.** `pytest tests/services/test_lease_service.py -q` → `4 passed`.

- [ ] **B1.5: Commit.** `git add backend/app/services backend/tests/services && git commit -m "feat(services): add lease service with activity recording and views"`

---

### Krok końcowy: Weryfikacja

- [ ] **V.1:** Z `backend/`: `pytest -q && ruff check . && ruff format --check .` → zielone.
- [ ] **V.2:** `grep -nE "datetime\.(now|utcnow)" app/domain app/services` → brak wyników.
- [ ] **V.3:** PR → `main`.
