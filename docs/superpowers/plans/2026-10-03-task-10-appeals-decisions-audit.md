# Zadanie 10: Audyt, decyzje administratora, tryb `auto` i odwołania — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecany) lub `superpowers:executing-plans`. Kroki używają checkboxów (`- [ ]`).

**Cel:** Niezmienny dziennik audytowy, wyliczanie przedłużeń (mnożnik / dni / data), decyzje administratora (`EXTEND`, `DOWNSCOPE`, `REVOKE`) przez `VCSProvider`, egzekwowanie w trybie `auto` oraz odwołania z celowym tarciem.

**Architektura:**
- `app/services/errors.py`: `ServiceError(status_code, detail)`; API (Zadanie 11) mapuje go na HTTP.
- `app/services/audit_service.py`: jedyne miejsce zapisu do `AuditLog`. Udostępnia tylko zapis i odczyt.
- `app/domain/extension.py`: czysta funkcja nowej daty wygaśnięcia (ADR 0007 §4).
- `app/services/decision_service.py`: `apply_decision` i `enforce_expired`. Uprawnienia zmienia wyłącznie przez port, a `LastAdminError` audytuje i przekazuje dalej.
- `app/services/appeal_service.py`: składanie, rozpatrywanie i lista odwołań (ADR 0007 §5).

**Krok 1 scal (albo wypchnij jako gałąź bazową) jak najszybciej** — korzysta z niego Zadanie 9 (Część C).

**Stack:** SQLAlchemy async; Python 3.14.

**Spec:** ADR 0005; ADR 0007 §4–6; ADR 0006 §4, §7; plan główny — Zadanie 10.

**Branch:** `feat/task-10-appeals-decisions-audit` · **Zależności:** 3, 5, 8 (Część B) · **Odblokowuje:** 9 (C), 11

## Ograniczenia globalne

- Każda decyzja i każde odwołanie zapisuje `AuditLog`. `AuditLog` nie ma ścieżki update ani delete.
- `EXTEND`: `days` → `max(now, expires_at) + N`; `multiplier` → `now + round((expires_at - granted_at) × M)`; `until` → `until` (musi być > `now`). Zawsze `granted_at = now`.
- `DOWNSCOPE` tylko z `write`; `admin` nie podlega `EXTEND` ani `DOWNSCOPE` (422).
- Odwołanie: status dostępu `WARNING`/`EXPIRED`/`REVOKED` (inaczej 409), najwyżej jedno `PENDING` (409), uzasadnienie nowe po normalizacji (422).
- Czas zawsze z argumentu `now`.

## Review Focus

- **Przedłużenie wygasłego dostępu presetem:** liczone od `now`, nie od daty w przeszłości → test `test_days_extend_from_later_of_now_and_expiry`.
- **Ostatni admin w trybie decyzji:** `REVOKE` na `tomasz-admin` zostawia ślad `LAST_ADMIN_BLOCKED` i zwraca błąd → test `test_last_admin_block_is_audited_and_reraised`.
- **Uzasadnienie różniące się tylko wielkością liter / spacjami:** traktowane jak powtórzone → test `test_appeal_requires_unique_justification`.
- **Podwójne rozpatrzenie odwołania:** drugie `resolve` → 409 → test `test_resolved_appeal_cannot_be_resolved_again`.
- **Tryb `auto` a ostatni admin:** pojedynczy `LastAdminError` nie przerywa przebiegu dla pozostałych dostępów → test `test_enforce_expired_applies_recommendations_as_system`.

---

### Krok 1: `ServiceError` i `audit_service` (szybki merge dla Zadania 9)

**Pliki:**
- Utwórz: `backend/app/services/errors.py`, `backend/app/services/audit_service.py` (oraz puste `app/services/__init__.py`, `tests/services/__init__.py`, jeśli brak)
- Test: `backend/tests/services/test_audit_service.py`

**Interfejsy:**
- Produkuje: `ServiceError(status_code: int, detail: str)`; `write_audit_event(session, *, now, actor_type, actor_id, action, target, details=None, justification=None) -> AuditLog`; `list_audit_events(session, actor_type: ActorType | None = None) -> list[AuditLog]` (najnowsze pierwsze).

- [ ] **1.1: Napisz testy** `backend/tests/services/test_audit_service.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.audit_service as audit_service
from app.domain.enums import ActorType, AuditAction
from app.services.audit_service import list_audit_events, write_audit_event

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def test_audit_event_records_actor_and_decision(session: AsyncSession) -> None:
    entry = await write_audit_event(
        session, now=NOW, actor_type=ActorType.ADMIN, actor_id="tomasz-admin", action=AuditAction.LEASE_EXTENDED,
        target="longtails/core-api:kamil-dev", details="days=14", justification="Release v2.1",
    )

    assert entry.id is not None
    assert (entry.timestamp, entry.actor_type, entry.actor_id) == (NOW, ActorType.ADMIN, "tomasz-admin")
    assert (entry.action, entry.details, entry.justification) == (AuditAction.LEASE_EXTENDED, "days=14", "Release v2.1")


async def test_list_audit_events_newest_first_and_filters_actor_type(session: AsyncSession) -> None:
    await write_audit_event(session, now=NOW, actor_type=ActorType.SYSTEM, actor_id=None,
                            action=AuditAction.LEASE_REVOKED, target="a")
    await write_audit_event(session, now=NOW + timedelta(hours=1), actor_type=ActorType.ADMIN, actor_id="tomasz-admin",
                            action=AuditAction.LEASE_EXTENDED, target="b")

    everything = await list_audit_events(session)
    system_only = await list_audit_events(session, ActorType.SYSTEM)

    assert [entry.target for entry in everything] == ["b", "a"]
    assert [entry.target for entry in system_only] == ["a"]


def test_audit_service_exposes_no_mutation_of_history() -> None:
    public = {name for name in dir(audit_service) if not name.startswith("_")}

    assert not {name for name in public if name.startswith(("update", "delete", "remove"))}
```

- [ ] **1.2: Uruchom — RED.** Z `backend/`: `pytest tests/services/test_audit_service.py -q` → `ModuleNotFoundError`.

- [ ] **1.3: Zaimplementuj.**

`backend/app/services/errors.py`:

```python
class ServiceError(Exception):
    """Błąd domenowy z kodem HTTP; API v1 zamienia go na {"detail": ...}."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
```

`backend/app/services/audit_service.py`:

```python
"""Niezmienny dziennik audytowy: tylko zapis i odczyt (M6, ADR 0005)."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActorType, AuditAction
from app.models import AuditLog


async def write_audit_event(
    session: AsyncSession,
    *,
    now: datetime,
    actor_type: ActorType,
    actor_id: str | None,
    action: AuditAction,
    target: str,
    details: str | None = None,
    justification: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        timestamp=now, actor_type=actor_type, actor_id=actor_id, action=action, target=target,
        details=details, justification=justification,
    )
    session.add(entry)
    await session.flush()
    return entry


async def list_audit_events(session: AsyncSession, actor_type: ActorType | None = None) -> list[AuditLog]:
    query = select(AuditLog).order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
    if actor_type is not None:
        query = query.where(AuditLog.actor_type == actor_type)
    return list((await session.scalars(query)).all())
```

- [ ] **1.4: Uruchom — GREEN.** `pytest tests/services/test_audit_service.py -q` → `3 passed`.

- [ ] **1.5: Commit i push** (Zadanie 9 może zrobić stack na tej gałęzi):

```bash
git add backend/app/services/errors.py backend/app/services/audit_service.py backend/tests/services/test_audit_service.py
git commit -m "feat(services): add service error and immutable audit log service"
git push -u origin feat/task-10-appeals-decisions-audit
```

---

### Krok 2: `compute_extension` (czysta funkcja)

**Pliki:**
- Utwórz: `backend/app/domain/extension.py`
- Test: `backend/tests/domain/test_extension.py`

**Interfejsy:**
- Produkuje: `compute_extension(now, granted_at, expires_at, *, multiplier=None, days=None, until=None) -> datetime` (`ValueError` przy braku długości lub `until <= now`).

- [ ] **2.1: Napisz testy** `backend/tests/domain/test_extension.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest

from app.domain.extension import compute_extension

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
GRANTED = NOW - timedelta(days=27)
EXPIRES = NOW + timedelta(days=3)


def test_days_extend_from_later_of_now_and_expiry() -> None:
    assert compute_extension(NOW, GRANTED, EXPIRES, days=7) == EXPIRES + timedelta(days=7)
    expired = NOW - timedelta(days=15)
    assert compute_extension(NOW, GRANTED, expired, days=14) == NOW + timedelta(days=14)


def test_multiplier_scales_current_ttl() -> None:
    assert compute_extension(NOW, GRANTED, EXPIRES, multiplier=2) == NOW + timedelta(days=60)
    assert compute_extension(NOW, GRANTED, EXPIRES, multiplier=1.5) == NOW + timedelta(days=45)


def test_until_must_be_in_future() -> None:
    target = NOW + timedelta(days=40)
    assert compute_extension(NOW, GRANTED, EXPIRES, until=target) == target

    with pytest.raises(ValueError):
        compute_extension(NOW, GRANTED, EXPIRES, until=NOW)


def test_duration_required() -> None:
    with pytest.raises(ValueError):
        compute_extension(NOW, GRANTED, EXPIRES)
```

- [ ] **2.2: Uruchom — RED.** `pytest tests/domain/test_extension.py -q` → `ModuleNotFoundError`.

- [ ] **2.3: Zaimplementuj** `backend/app/domain/extension.py`:

```python
"""Nowa data wygaśnięcia przy przedłużeniu (ADR 0005 §2, ADR 0007 §4)."""

from datetime import datetime, timedelta

DAY = timedelta(days=1)


def compute_extension(
    now: datetime,
    granted_at: datetime,
    expires_at: datetime,
    *,
    multiplier: float | None = None,
    days: int | None = None,
    until: datetime | None = None,
) -> datetime:
    if days is not None:
        return max(now, expires_at) + timedelta(days=days)
    if multiplier is not None:
        ttl_days = (expires_at - granted_at) / DAY
        return now + timedelta(days=round(ttl_days * multiplier))
    if until is not None:
        if until <= now:
            raise ValueError("Extension date must be in the future")
        return until
    raise ValueError("Extension requires multiplier, days or until")
```

- [ ] **2.4: Uruchom — GREEN.** `pytest tests/domain/test_extension.py -q` → `4 passed`.

- [ ] **2.5: Commit.** `git add backend/app/domain/extension.py backend/tests/domain/test_extension.py && git commit -m "feat(domain): add lease extension calculation"`

---

### Krok 3: `decision_service` — decyzje i tryb `auto`

**Pliki:**
- Utwórz: `backend/app/services/decision_service.py`, `backend/tests/fakes.py`
- Test: `backend/tests/services/test_decision_service.py`

**Interfejsy:**
- Konsumuje: `VCSProvider`, `LastAdminError` (1), `list_lease_views` (8), `compute_extension` (Krok 2), `write_audit_event` (Krok 1).
- Produkuje: `apply_decision(session, vcs, *, lease, action, now, actor_type, actor_id, justification, multiplier=None, days=None, until=None) -> Lease`; `enforce_expired(session, vcs, now) -> int`; `lease_target(lease) -> str`; testowy `RecordingVCS` w `tests/fakes.py`.

- [ ] **3.1: Dodaj fake portu** `backend/tests/fakes.py`:

```python
from app.domain.enums import Permission
from app.ports.vcs_provider import LastAdminError


class RecordingVCS:
    """Fake VCSProvider: zapisuje wywołania, opcjonalnie blokuje wskazanych adminów."""

    def __init__(self, last_admins: set[str] | None = None) -> None:
        self.calls: list[tuple[str, ...]] = []
        self._last_admins = last_admins or set()

    async def set_permission(self, owner: str, repo: str, username: str, permission: Permission) -> None:
        if username in self._last_admins and permission is not Permission.ADMIN:
            raise LastAdminError("Cannot remove the last administrator of the repository")
        self.calls.append(("set", f"{owner}/{repo}", username, permission.value))

    async def remove_collaborator(self, owner: str, repo: str, username: str) -> None:
        if username in self._last_admins:
            raise LastAdminError("Cannot remove the last administrator of the repository")
        self.calls.append(("remove", f"{owner}/{repo}", username))
```

- [ ] **3.2: Napisz testy** `backend/tests/services/test_decision_service.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType, ActorType, AuditAction, DecisionAction, Permission
from app.models import AuditLog, Lease
from app.ports.vcs_provider import LastAdminError
from app.services.decision_service import apply_decision, enforce_expired
from app.services.errors import ServiceError
from tests.factories import make_event, make_lease, make_repo, make_user
from tests.fakes import RecordingVCS

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
ADMIN = {"actor_type": ActorType.ADMIN, "actor_id": "tomasz-admin"}


async def writer_lease(session: AsyncSession, *, expires_in: int = 3, revoked: bool = False) -> Lease:
    user = await make_user(session, "marta-qa")
    repo = await make_repo(session, "qa-automation")
    return await make_lease(
        session, user, repo, Permission.WRITE, granted_at=NOW - timedelta(days=27),
        expires_at=NOW + timedelta(days=expires_in), revoked_at=NOW - timedelta(days=1) if revoked else None,
    )


async def audit_actions(session: AsyncSession) -> list[AuditAction]:
    return [row.action for row in (await session.scalars(select(AuditLog).order_by(AuditLog.id))).all()]


async def test_extend_by_preset_updates_expiry_and_audits(session: AsyncSession) -> None:
    lease = await writer_lease(session)

    await apply_decision(session, RecordingVCS(), lease=lease, action=DecisionAction.EXTEND, now=NOW,
                         justification="Release v2.1", days=14, **ADMIN)

    assert lease.expires_at == NOW + timedelta(days=17)
    assert lease.granted_at == NOW
    entry = await session.scalar(select(AuditLog))
    assert (entry.action, entry.target, entry.justification) == (
        AuditAction.LEASE_EXTENDED, "longtails/qa-automation:marta-qa", "Release v2.1"
    )


async def test_extend_revoked_lease_restores_access_via_vcs(session: AsyncSession) -> None:
    lease = await writer_lease(session, revoked=True)
    vcs = RecordingVCS()

    await apply_decision(session, vcs, lease=lease, action=DecisionAction.EXTEND, now=NOW,
                         justification="Back on the project", multiplier=2, **ADMIN)

    assert vcs.calls == [("set", "longtails/qa-automation", "marta-qa", "write")]
    assert lease.revoked_at is None
    assert lease.expires_at == NOW + timedelta(days=60)


async def test_downscope_sets_read_and_new_period(session: AsyncSession) -> None:
    lease = await writer_lease(session)
    vcs = RecordingVCS()

    await apply_decision(session, vcs, lease=lease, action=DecisionAction.DOWNSCOPE, now=NOW,
                         justification="Only reviews", **ADMIN)

    assert vcs.calls == [("set", "longtails/qa-automation", "marta-qa", "read")]
    assert (lease.current_role, lease.granted_at, lease.expires_at) == (Permission.READ, NOW, NOW + timedelta(days=30))
    assert await audit_actions(session) == [AuditAction.LEASE_DOWNSCOPED]


async def test_downscope_requires_write(session: AsyncSession) -> None:
    lease = await writer_lease(session)
    lease.current_role = Permission.READ

    with pytest.raises(ServiceError) as error:
        await apply_decision(session, RecordingVCS(), lease=lease, action=DecisionAction.DOWNSCOPE, now=NOW,
                             justification="x", **ADMIN)
    assert error.value.status_code == 422


async def test_revoke_calls_vcs_and_audits(session: AsyncSession) -> None:
    lease = await writer_lease(session)
    vcs = RecordingVCS()

    await apply_decision(session, vcs, lease=lease, action=DecisionAction.REVOKE, now=NOW,
                         justification="Unused", **ADMIN)

    assert vcs.calls == [("remove", "longtails/qa-automation", "marta-qa")]
    assert lease.revoked_at == NOW
    assert await audit_actions(session) == [AuditAction.LEASE_REVOKED]


async def test_admin_lease_cannot_be_extended_or_downscoped(session: AsyncSession) -> None:
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    repo = await make_repo(session, "core-api")
    lease = await make_lease(session, admin, repo, Permission.ADMIN, granted_at=NOW, expires_at=None)

    for action, extra in ((DecisionAction.EXTEND, {"days": 7}), (DecisionAction.DOWNSCOPE, {})):
        with pytest.raises(ServiceError) as error:
            await apply_decision(session, RecordingVCS(), lease=lease, action=action, now=NOW, justification="x",
                                 **extra, **ADMIN)
        assert error.value.status_code == 422


async def test_last_admin_block_is_audited_and_reraised(session: AsyncSession) -> None:
    admin = await make_user(session, "tomasz-admin", team=None, is_admin=True)
    repo = await make_repo(session, "core-api")
    lease = await make_lease(session, admin, repo, Permission.ADMIN, granted_at=NOW, expires_at=None)

    with pytest.raises(LastAdminError):
        await apply_decision(session, RecordingVCS(last_admins={"tomasz-admin"}), lease=lease,
                             action=DecisionAction.REVOKE, now=NOW, justification="demo", **ADMIN)

    assert lease.revoked_at is None
    assert await audit_actions(session) == [AuditAction.LAST_ADMIN_BLOCKED]


async def test_enforce_expired_applies_recommendations_as_system(session: AsyncSession) -> None:
    kamil = await make_user(session, "kamil-dev")
    piotr = await make_user(session, "piotr-dev")
    anna = await make_user(session, "anna-dev")
    gw = await make_repo(session, "payment-gw")
    legacy = await make_repo(session, "legacy-billing")
    reviewer = await make_lease(session, kamil, gw, Permission.WRITE, granted_at=NOW - timedelta(days=35),
                                expires_at=NOW - timedelta(days=5))
    await make_event(session, kamil, gw, ActionType.PR_REVIEW, NOW - timedelta(days=3))
    unused = await make_lease(session, piotr, legacy, Permission.WRITE, granted_at=NOW - timedelta(days=45),
                              expires_at=NOW - timedelta(days=15))
    healthy = await make_lease(session, anna, gw, Permission.WRITE, granted_at=NOW, expires_at=NOW + timedelta(days=30))

    applied = await enforce_expired(session, RecordingVCS(), NOW)

    assert applied == 2
    assert reviewer.current_role is Permission.READ
    assert unused.revoked_at == NOW
    assert healthy.revoked_at is None and healthy.current_role is Permission.WRITE
    rows = (await session.scalars(select(AuditLog))).all()
    assert {row.actor_type for row in rows} == {ActorType.SYSTEM}
```

- [ ] **3.3: Uruchom — RED.** `pytest tests/services/test_decision_service.py -q` → `ModuleNotFoundError`.

- [ ] **3.4: Zaimplementuj** `backend/app/services/decision_service.py`:

```python
"""Decyzje o dostępach (ADR 0007 §4) i egzekwowanie w trybie auto (§6)."""

from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActorType, AuditAction, DecisionAction, LeaseStatus, Permission, Recommendation
from app.domain.extension import compute_extension
from app.models import Lease
from app.ports.vcs_provider import LastAdminError, VCSProvider
from app.services.audit_service import write_audit_event
from app.services.errors import ServiceError
from app.services.lease_service import list_lease_views

AUTO_JUSTIFICATION = "Automatic enforcement: lease expired"
_AUDIT_ACTION = {
    DecisionAction.EXTEND: AuditAction.LEASE_EXTENDED,
    DecisionAction.DOWNSCOPE: AuditAction.LEASE_DOWNSCOPED,
    DecisionAction.REVOKE: AuditAction.LEASE_REVOKED,
}


def lease_target(lease: Lease) -> str:
    return f"{lease.repo.owner}/{lease.repo.name}:{lease.user.login}"


async def apply_decision(
    session: AsyncSession,
    vcs: VCSProvider,
    *,
    lease: Lease,
    action: DecisionAction,
    now: datetime,
    actor_type: ActorType,
    actor_id: str | None,
    justification: str,
    multiplier: float | None = None,
    days: int | None = None,
    until: datetime | None = None,
) -> Lease:
    if action is DecisionAction.REJECT:
        raise ServiceError(422, "REJECT applies only to appeals")
    if lease.current_role is Permission.ADMIN and action is not DecisionAction.REVOKE:
        raise ServiceError(422, "Admin role is permanent (break-glass) and cannot be extended or downscoped")
    owner, repo, login = lease.repo.owner, lease.repo.name, lease.user.login
    try:
        if action is DecisionAction.EXTEND:
            details = await _extend(vcs, lease, now, multiplier, days, until)
        elif action is DecisionAction.DOWNSCOPE:
            details = await _downscope(vcs, lease, now)
        else:
            await vcs.remove_collaborator(owner, repo, login)
            lease.revoked_at = now
            details = "revoked"
    except LastAdminError as error:
        await write_audit_event(
            session, now=now, actor_type=actor_type, actor_id=actor_id, action=AuditAction.LAST_ADMIN_BLOCKED,
            target=lease_target(lease), details=str(error), justification=justification,
        )
        raise
    await write_audit_event(
        session, now=now, actor_type=actor_type, actor_id=actor_id, action=_AUDIT_ACTION[action],
        target=lease_target(lease), details=details, justification=justification,
    )
    return lease


async def _extend(
    vcs: VCSProvider, lease: Lease, now: datetime, multiplier: float | None, days: int | None, until: datetime | None
) -> str:
    try:
        new_expiry = compute_extension(
            now, lease.granted_at, lease.expires_at, multiplier=multiplier, days=days, until=until
        )
    except ValueError as error:
        raise ServiceError(422, str(error)) from error
    if lease.revoked_at is not None:
        await vcs.set_permission(lease.repo.owner, lease.repo.name, lease.user.login, lease.current_role)
        lease.revoked_at = None
    lease.granted_at = now
    lease.expires_at = new_expiry
    duration = f"multiplier={multiplier}" if multiplier else f"days={days}" if days else f"until={until.isoformat()}"
    return f"{duration}; expires_at={new_expiry.isoformat()}"


async def _downscope(vcs: VCSProvider, lease: Lease, now: datetime) -> str:
    if lease.current_role is not Permission.WRITE or lease.revoked_at is not None:
        raise ServiceError(422, "Only an active write lease can be downscoped to read")
    await vcs.set_permission(lease.repo.owner, lease.repo.name, lease.user.login, Permission.READ)
    lease.current_role = Permission.READ
    lease.granted_at = now
    lease.expires_at = now + timedelta(days=lease.repo.default_lease_days)
    return f"write -> read; expires_at={lease.expires_at.isoformat()}"


async def enforce_expired(session: AsyncSession, vcs: VCSProvider, now: datetime) -> int:
    applied = 0
    for view in await list_lease_views(session, now):
        if view.status is not LeaseStatus.EXPIRED or view.recommendation is Recommendation.KEEP:
            continue
        lease = await session.get(Lease, view.id)
        action = DecisionAction.DOWNSCOPE if view.recommendation is Recommendation.DOWNSCOPE else DecisionAction.REVOKE
        try:
            await apply_decision(
                session, vcs, lease=lease, action=action, now=now, actor_type=ActorType.SYSTEM, actor_id=None,
                justification=AUTO_JUSTIFICATION,
            )
        except LastAdminError:
            continue
        applied += 1
    return applied
```

- [ ] **3.5: Uruchom — GREEN.** `pytest tests/services/test_decision_service.py -q` → `8 passed`.

- [ ] **3.6: Commit.** `git add backend/app/services/decision_service.py backend/tests/fakes.py backend/tests/services/test_decision_service.py && git commit -m "feat(services): add admin decisions and auto enforcement"`

---

### Krok 4: `appeal_service`

**Pliki:**
- Utwórz: `backend/app/services/appeal_service.py`
- Test: `backend/tests/services/test_appeal_service.py`

**Interfejsy:**
- Konsumuje: `apply_decision`, `lease_target` (Krok 3), `evaluate_status`, `days_remaining` (8), `load_facts` (8), `AppealView` (5).
- Produkuje: `submit_appeal(session, *, lease_id, justification, now) -> Appeal`; `resolve_appeal(session, vcs, *, appeal_id, action, now, admin_login, justification, multiplier=None, days=None, until=None) -> Appeal`; `list_appeal_views(session, now) -> list[AppealView]`; `to_appeal_view(appeal, all_appeals, facts, now) -> AppealView`.

- [ ] **4.1: Napisz testy** `backend/tests/services/test_appeal_service.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType, AppealStatus, AuditAction, DecisionAction, LeaseStatus, Permission
from app.models import AuditLog, Lease
from app.services.appeal_service import list_appeal_views, resolve_appeal, submit_appeal
from app.services.errors import ServiceError
from tests.factories import make_event, make_lease, make_repo, make_user
from tests.fakes import RecordingVCS

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def lease_expiring_in(session: AsyncSession, days: int) -> Lease:
    user = await make_user(session, "marta-qa")
    repo = await make_repo(session, "qa-automation")
    return await make_lease(session, user, repo, Permission.WRITE, granted_at=NOW - timedelta(days=30 - days),
                            expires_at=NOW + timedelta(days=days))


async def test_appeal_requires_unique_justification(session: AsyncSession) -> None:
    lease = await lease_expiring_in(session, 3)
    first = await submit_appeal(session, lease_id=lease.id, justification="Release v2.1 next week", now=NOW)
    await resolve_appeal(session, RecordingVCS(), appeal_id=first.id, action=DecisionAction.REJECT, now=NOW,
                         admin_login="tomasz-admin", justification="Not convinced")

    for repeated in ("  release V2.1   next week ", "", "   "):
        with pytest.raises(ServiceError) as error:
            await submit_appeal(session, lease_id=lease.id, justification=repeated, now=NOW)
        assert error.value.status_code == 422

    second = await submit_appeal(session, lease_id=lease.id, justification="Hotfix for payment bug", now=NOW)
    assert second.status is AppealStatus.PENDING
    assert second.requested_role is Permission.WRITE


async def test_appeal_rejected_for_active_lease(session: AsyncSession) -> None:
    lease = await lease_expiring_in(session, 20)

    with pytest.raises(ServiceError) as error:
        await submit_appeal(session, lease_id=lease.id, justification="Just in case", now=NOW)
    assert error.value.status_code == 409


async def test_only_one_pending_appeal_per_lease(session: AsyncSession) -> None:
    lease = await lease_expiring_in(session, 3)
    await submit_appeal(session, lease_id=lease.id, justification="Release", now=NOW)

    with pytest.raises(ServiceError) as error:
        await submit_appeal(session, lease_id=lease.id, justification="Another reason", now=NOW)
    assert error.value.status_code == 409


async def test_admin_can_extend_or_revoke_appeal(session: AsyncSession) -> None:
    lease = await lease_expiring_in(session, 3)
    appeal = await submit_appeal(session, lease_id=lease.id, justification="Release v2.1", now=NOW)

    resolved = await resolve_appeal(session, RecordingVCS(), appeal_id=appeal.id, action=DecisionAction.EXTEND,
                                    now=NOW, admin_login="tomasz-admin", justification="Approved", multiplier=2)

    assert (resolved.status, resolved.resolved_at) == (AppealStatus.APPROVED, NOW)
    assert lease.expires_at == NOW + timedelta(days=60)
    actions = [row.action for row in (await session.scalars(select(AuditLog).order_by(AuditLog.id))).all()]
    assert actions == [AuditAction.APPEAL_SUBMITTED, AuditAction.LEASE_EXTENDED]

    second = await submit_appeal(session, lease_id=lease.id, justification="Need more", now=NOW + timedelta(days=55))
    revoked = await resolve_appeal(session, RecordingVCS(), appeal_id=second.id, action=DecisionAction.REVOKE,
                                   now=NOW + timedelta(days=55), admin_login="tomasz-admin", justification="Enough")
    assert revoked.status is AppealStatus.APPROVED
    assert lease.revoked_at == NOW + timedelta(days=55)


async def test_reject_leaves_lease_untouched(session: AsyncSession) -> None:
    lease = await lease_expiring_in(session, 3)
    appeal = await submit_appeal(session, lease_id=lease.id, justification="Release", now=NOW)

    rejected = await resolve_appeal(session, RecordingVCS(), appeal_id=appeal.id, action=DecisionAction.REJECT,
                                    now=NOW, admin_login="tomasz-admin", justification="No business need")

    assert rejected.status is AppealStatus.REJECTED
    assert lease.expires_at == NOW + timedelta(days=3)


async def test_resolved_appeal_cannot_be_resolved_again(session: AsyncSession) -> None:
    lease = await lease_expiring_in(session, 3)
    appeal = await submit_appeal(session, lease_id=lease.id, justification="Release", now=NOW)
    await resolve_appeal(session, RecordingVCS(), appeal_id=appeal.id, action=DecisionAction.REJECT, now=NOW,
                         admin_login="tomasz-admin", justification="No")

    with pytest.raises(ServiceError) as error:
        await resolve_appeal(session, RecordingVCS(), appeal_id=appeal.id, action=DecisionAction.EXTEND, now=NOW,
                             admin_login="tomasz-admin", justification="Changed mind", days=7)
    assert error.value.status_code == 409


async def test_list_appeal_views_includes_usage_stats(session: AsyncSession) -> None:
    lease = await lease_expiring_in(session, 3)
    await make_event(session, lease.user, lease.repo, ActionType.PUSH, NOW - timedelta(days=27))
    await make_event(session, lease.user, lease.repo, ActionType.ISSUE_COMMENT, NOW - timedelta(days=40))
    first = await submit_appeal(session, lease_id=lease.id, justification="Release", now=NOW)
    await resolve_appeal(session, RecordingVCS(), appeal_id=first.id, action=DecisionAction.REJECT, now=NOW,
                         admin_login="tomasz-admin", justification="No")
    await submit_appeal(session, lease_id=lease.id, justification="Hotfix", now=NOW + timedelta(hours=1))

    views = await list_appeal_views(session, NOW + timedelta(hours=1))

    newest = views[0]
    assert newest.justification == "Hotfix"
    assert newest.previous_appeals == 1
    assert newest.recent_activity_count == 1
    assert newest.lease_status is LeaseStatus.WARNING
    assert newest.days_remaining == 3
    assert newest.user.login == "marta-qa"
```

- [ ] **4.2: Uruchom — RED.** `pytest tests/services/test_appeal_service.py -q` → `ModuleNotFoundError`.

- [ ] **4.3: Zaimplementuj** `backend/app/services/appeal_service.py`:

```python
"""Odwołania z celowym tarciem (ADR 0005 §3, ADR 0007 §5)."""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActorType, AppealStatus, AuditAction, DecisionAction, LeaseStatus
from app.domain.lease_rules import ActivityFact, days_remaining, evaluate_status
from app.models import Appeal, Lease
from app.ports.vcs_provider import VCSProvider
from app.schemas.api import AppealView, RepoRef, UserRef
from app.services.audit_service import write_audit_event
from app.services.decision_service import apply_decision, lease_target
from app.services.errors import ServiceError
from app.services.lease_service import load_facts

APPEALABLE = {LeaseStatus.WARNING, LeaseStatus.EXPIRED, LeaseStatus.REVOKED}


def normalize(text: str) -> str:
    return " ".join(text.split()).casefold()


async def submit_appeal(session: AsyncSession, *, lease_id: int, justification: str, now: datetime) -> Appeal:
    lease = await session.get(Lease, lease_id)
    if lease is None:
        raise ServiceError(404, f"Lease {lease_id} not found")
    if evaluate_status(lease.current_role, lease.expires_at, lease.revoked_at, now) not in APPEALABLE:
        raise ServiceError(409, "Appeals are accepted only for leases in warning, expired or revoked state")
    pending = await session.scalar(
        select(Appeal.id).where(Appeal.lease_id == lease_id, Appeal.status == AppealStatus.PENDING)
    )
    if pending is not None:
        raise ServiceError(409, "This lease already has a pending appeal")
    normalized = normalize(justification)
    previous = await session.scalars(select(Appeal.justification).where(Appeal.user_id == lease.user_id))
    if not normalized:
        raise ServiceError(422, "Justification is required")
    if normalized in {normalize(text) for text in previous}:
        raise ServiceError(422, "Justification must be new; previous justifications cannot be reused")

    appeal = Appeal(
        lease_id=lease.id, user_id=lease.user_id, repo_id=lease.repo_id, requested_role=lease.current_role,
        justification=justification.strip(), status=AppealStatus.PENDING, created_at=now,
    )
    session.add(appeal)
    await write_audit_event(
        session, now=now, actor_type=ActorType.USER, actor_id=lease.user.login, action=AuditAction.APPEAL_SUBMITTED,
        target=lease_target(lease), justification=appeal.justification,
    )
    await session.refresh(appeal)
    return appeal


async def resolve_appeal(
    session: AsyncSession,
    vcs: VCSProvider,
    *,
    appeal_id: int,
    action: DecisionAction,
    now: datetime,
    admin_login: str,
    justification: str,
    multiplier: float | None = None,
    days: int | None = None,
    until: datetime | None = None,
) -> Appeal:
    appeal = await session.get(Appeal, appeal_id)
    if appeal is None:
        raise ServiceError(404, f"Appeal {appeal_id} not found")
    if appeal.status is not AppealStatus.PENDING:
        raise ServiceError(409, "Appeal has already been resolved")
    if action is DecisionAction.REJECT:
        appeal.status = AppealStatus.REJECTED
        await write_audit_event(
            session, now=now, actor_type=ActorType.ADMIN, actor_id=admin_login, action=AuditAction.APPEAL_REJECTED,
            target=lease_target(appeal.lease), justification=justification,
        )
    else:
        await apply_decision(
            session, vcs, lease=appeal.lease, action=action, now=now, actor_type=ActorType.ADMIN, actor_id=admin_login,
            justification=justification, multiplier=multiplier, days=days, until=until,
        )
        appeal.status = AppealStatus.APPROVED
    appeal.resolved_at = now
    await session.flush()
    return appeal


def to_appeal_view(
    appeal: Appeal, all_appeals: list[Appeal], facts: list[ActivityFact], now: datetime
) -> AppealView:
    lease = appeal.lease
    window_start = now - timedelta(days=lease.repo.default_lease_days)
    return AppealView(
        id=appeal.id,
        lease_id=lease.id,
        user=UserRef.model_validate(appeal.user),
        repo=RepoRef.model_validate(appeal.repo),
        requested_role=appeal.requested_role,
        justification=appeal.justification,
        status=appeal.status,
        created_at=appeal.created_at,
        resolved_at=appeal.resolved_at,
        lease_status=evaluate_status(lease.current_role, lease.expires_at, lease.revoked_at, now),
        days_remaining=days_remaining(lease.current_role, lease.expires_at, lease.revoked_at, now),
        recent_activity_count=sum(1 for item in facts if window_start <= item.occurred_at <= now),
        previous_appeals=sum(
            1 for other in all_appeals if other.user_id == appeal.user_id and other.created_at < appeal.created_at
        ),
    )


async def list_appeal_views(session: AsyncSession, now: datetime) -> list[AppealView]:
    appeals = list((await session.scalars(select(Appeal).order_by(Appeal.created_at.desc(), Appeal.id.desc()))).all())
    facts = await load_facts(session)
    return [
        to_appeal_view(appeal, appeals, facts.get((appeal.user_id, appeal.repo_id), []), now) for appeal in appeals
    ]
```

- [ ] **4.4: Uruchom — GREEN.** `pytest tests/services/test_appeal_service.py -q` → `7 passed`.

- [ ] **4.5: Commit.** `git add backend/app/services/appeal_service.py backend/tests/services/test_appeal_service.py && git commit -m "feat(services): add appeals with intentional friction"`

---

### Krok 5: Weryfikacja

- [ ] **5.1:** Z `backend/`: `pytest -q && ruff check . && ruff format --check .` → zielone.
- [ ] **5.2:** `wc -l app/services/*.py app/domain/extension.py` → każdy ≤ 300.
- [ ] **5.3:** PR → `main`.
