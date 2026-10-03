# Silnik dzierżawy (Osoba 3, kroki 3.1–3.6) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Na prośbę użytkownika („jak najszybciej”) plan jest zwięzły: dokładne sygnatury, lista testów z oczekiwanymi wartościami,
> polecenia i commit po każdym kroku. Kod powstaje od razu w commitach (TDD: test → RED → kod → GREEN).

**Goal:** Silnik dzierżawy: status, odnawianie, rekomendacje, ochrona ostatniego admina, tryby i endpointy, z których korzystają Osoby 4, 5 i 6.

**Architecture:** Czyste reguły w `app/domain/lease_rules.py`, cienkie serwisy async (`lease_service`, `decision_service`,
`enforcement_service`, `last_admin_guard`) i routery API v1. Dostęp zmienia się wyłącznie przez port `VCSProvider`;
serwis aktualizuje własny wiersz `Lease` po wywołaniu portu. Audyt tylko przez `write_audit_event`.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2.0 async (SQLite), Pydantic v2, pytest (asyncio), `json-schema-to-typescript` przez `npx`.

**Spec:** [`docs/3-silnik-dzierzawy/DOCUMENTATION.md`](../../3-silnik-dzierzawy/DOCUMENTATION.md)

## Global Constraints

- Każdy plik ≤ 300 linii (`CODING_STANDARDS.md` §1.1); jawne type hints; `async`/`await` w serwisach i routerach.
- Czas wyłącznie z `ClockPort`/`TimeProvider`; nigdy `datetime.now()` (pilnuje `tests/core/test_no_system_clock.py`).
- Okno ostrzegawcze i dni tylko z `app/domain/lease_window.py`; akcje odnawiające tylko z `RENEWING_ACTIONS`.
- Serwisy robią `flush`, routery `commit`; błędy domenowe jako `ServiceError` (API v1 → `{"detail": ...}`).
- Każda zmiana schematów/enumów: `uv run python scripts/export_contract.py` + regeneracja `frontend/src/types/api.ts` (ADR 0009).
- Commit po każdym kroku 3.x, bez pusha. Stopka commita: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Znane błędy na `main` (nie ruszamy): 2 testy w `tests/repo/test_docs_integrity.py` (dwa ADR-y 0011).

## Review Focus

- Dzierżawa wygasająca dokładnie teraz albo dokładnie za 7 dni → `EXPIRED` / `WARNING` (Task 1).
- Zdarzenia z przyszłości względem `now` (po `DELETE /time-travel`) → ignorowane w rekomendacji i `last_activity_at` (Task 3).
- Decyzja na dzierżawie z odwołaniem `PENDING` → 409, a odwołanie nie zostaje osierocone (Task 6).
- `EXTEND` na odebranej dzierżawie → dostęp wraca przez port, `is_active = true` (Task 6).
- Tryb auto uruchomiony dwa razy oraz blokada ostatniego admina w trakcie przebiegu → brak zmian / `LAST_ADMIN_BLOCKED` i dalszy przebieg (Task 5).

---

### Task 0: Spec i plan

- [ ] Commit `docs/3-silnik-dzierzawy/DOCUMENTATION.md` i tego planu: `docs(p3): lease engine spec and plan`.

### Task 1 (3.1): Status dzierżawy

**Files:** Modify `backend/app/domain/enums.py` (`LeaseStatus` + `PERMANENT`, `REVOKED`); Create `backend/app/domain/lease_rules.py`;
Test `backend/tests/domain/test_lease_status.py`; regenerate `backend/contract/schema.json`, `frontend/src/types/api.ts`.

**Produces:**
- `lease_status(role: Role, expires_at: datetime | None, is_active: bool, now: datetime) -> LeaseStatus`
- `lease_days_remaining(status: LeaseStatus, expires_at: datetime | None, now: datetime) -> int | None`

- [ ] Testy (RED): `REVOKED` wygrywa nawet z adminem; admin i brak `expires_at` → `PERMANENT`; `expires_at == now` → `EXPIRED`;
  `now + 1 s` → `WARNING`; `now + 7 dni` → `WARNING`; `now + 7 dni + 1 s` → `ACTIVE`; dni: `None` dla `PERMANENT`/`REVOKED`,
  `1` przy 1 s, `7` przy 7 dniach, `0` w dniu po wygaśnięciu, `-1` dzień później.
- [ ] `uv run pytest tests/domain/test_lease_status.py -q` → FAIL (brak modułu).
- [ ] Implementacja; testy → PASS; eksport kontraktu i `npx` typów TS; `uv run pytest -q` (oczekiwane tylko 2 znane błędy).
- [ ] Aktualizacja §9 w DOCUMENTATION.md; commit `feat(lease): lease status against the simulated clock (3.1)`.

### Task 2 (3.2): Macierz odnawiania

**Files:** Modify `lease_rules.py`; Create `backend/app/services/lease_service.py`; Test `backend/tests/domain/test_renewal_matrix.py`,
`backend/tests/services/test_record_activity.py`.

**Produces:**
- `renews(action: ActionType, lease_role: Role) -> bool` — `False` dla admina i akcji spoza `RENEWING_ACTIONS`.
- `record_activity(session, *, user_id: int, repo_id: int, action: ActionType, occurred_at: datetime) -> ActivityEvent`.

- [ ] Testy: macierz parametryzowana (push → read ✅ write ✅ admin ❌; review/komentarz → read ✅ write ❌; merge/label/settings ❌);
  `record_activity` zapisuje zdarzenie z `required_permission`; push odnawia `write` do `occurred_at + 30 dni`; review nie odnawia `write`;
  komentarz odnawia `read`; `max` nie skraca przedłużenia admina; odebrana dzierżawa i admin bez zmian; merge nie odnawia;
  seed: każda dzierżawa nie-admin ma `expires_at = max(granted_at, odnawiające zdarzenia) + 30 dni` (po `seed_activity_extras`).
- [ ] RED → implementacja → GREEN → pełny zestaw → §9 → commit `feat(lease): renewal matrix and record_activity (3.2)`.

### Task 3 (3.3): Rekomendacja i przegląd dzierżaw

**Files:** Modify `lease_rules.py`, `lease_service.py`; Test `backend/tests/domain/test_recommendation.py`, `backend/tests/services/test_lease_overviews.py`.

**Produces:**
- `Activity(action: ActionType, at: datetime)` (frozen dataclass), `newest_activity(activity, *, since: datetime | None, until: datetime) -> Activity | None`
  (tylko akcje odnawiające; remis czasu → wyższy poziom).
- `recommend(status: LeaseStatus, role: Role, newest: ActionType | None) -> Recommendation`.
- `list_lease_overviews(session, now) -> list[LeaseOverview]` (po `id`), `get_lease_overview(session, lease_id, now) -> LeaseOverview` (404).

- [ ] Testy domeny: `ACTIVE`/`PERMANENT`/`REVOKED` → `KEEP`; `WARNING`/`EXPIRED` + brak → `REVOKE`; `write` + push → `KEEP`;
  `write` + review najnowszy → `DOWNSCOPE`; remis push/review → `KEEP`; `read` + komentarz → `KEEP`; okno pomija starsze i przyszłe zdarzenia.
- [ ] Testy serwisu: przegląd na własnych danych (status, dni, `last_activity_at` ignoruje merge i przyszłość);
  seed przy zegarze `2026-10-03T12:00Z`: wartości z tabeli §3.3 DOCUMENTATION.md (t0, +15, +30).
- [ ] RED → GREEN → pełny zestaw → §9 → commit `feat(lease): downscope detection and lease overviews (3.3)`.

### Task 4 (3.4): Ochrona ostatniego admina — gałąź `guziol/ochrona-ostatniego-admina` z `main`

**Files:** Modify `backend/app/services/errors.py` (`LastAdminError`), `backend/app/services/github_collaborator_service.py`,
`backend/app/ports/vcs_provider.py`, `backend/app/adapters/database_vcs.py`, `backend/tests/fakes.py`;
Create `backend/app/services/last_admin_guard.py`; Test `backend/tests/services/test_last_admin_guard.py`, `backend/tests/adapters/test_database_vcs.py`.

**Produces:**
- `class LastAdminError(ServiceError)` — 403; `ORG_MESSAGE`, `REPO_MESSAGE` jak w mocku.
- `ensure_not_last_admin(session, *, repository: Repository, user: User, lease: Lease) -> None`.
- `VCSProvider.remove_collaborator(owner: str, repo: str, username: str) -> None`; `RecordingVCS.removed`, `RecordingVCS(blocked={login})`.

- [ ] `git switch -c guziol/ochrona-ostatniego-admina main`; skopiować DOCUMENTATION.md i plan z `guziol/silnik-dzierzawy`.
- [ ] Testy: jedyny właściciel organizacji → `ORG_MESSAGE` (także dla jego dzierżawy `write`); ostatni admin repo → `REPO_MESSAGE`;
  drugi admin w repo → przechodzi; zwykła dzierżawa → przechodzi; adapter: `remove_collaborator` ustawia `is_active = false`,
  powtórka i brak dzierżawy nic nie robią, ostatni admin → `LastAdminError`; testy mocka (`tests/api/github_mock`) bez zmian.
- [ ] RED → GREEN → pełny zestaw → §4/§9 → commit `feat(lease): shared Last Admin Protection behind the VCS port (3.4)`.
- [ ] `git switch guziol/silnik-dzierzawy && git merge --no-ff guziol/ochrona-ostatniego-admina` (konflikt w dokumentacji rozwiązać ręcznie), pełny zestaw.

### Task 5 (3.5): Tryby disabled / warning / auto

**Files:** Modify `enums.py` (`EnforcementMode`, `AuditAction.ENFORCEMENT_MODE_CHANGED`), `lease_service.py` (parametr `mode`),
`backend/app/api/v1/deps.py` (`EnforcementDep`), `backend/app/api/v1/router.py`, `backend/app/api/v1/simulation.py` (hook), `backend/app/api/v1/demo.py` (reset trybu),
`backend/app/schemas/__init__.py`, `backend/tests/conftest.py` (reset trybu przed testem);
Create `backend/app/core/enforcement_mode.py`, `backend/app/services/decision_service.py`, `backend/app/services/enforcement_service.py`,
`backend/app/schemas/enforcement.py`, `backend/app/api/v1/enforcement.py`;
Test `backend/tests/services/test_decision_downscope_revoke.py`, `backend/tests/services/test_enforcement_service.py`, `backend/tests/api/test_enforcement_api.py`.

**Produces:**
- `EnforcementState` (`mode`, `reset()`), `enforcement_state`, `get_enforcement_state()`.
- `list_lease_overviews(session, now, *, mode: EnforcementMode | None = None)` — `None` = bieżący tryb; `disabled` → `KEEP`.
- `downscope_lease(session, vcs, *, lease, now, actor_id: int | None, justification: str | None) -> Lease`,
  `revoke_lease(...)` (to samo) — uzasadnienie wymagane (422), audyt, `LAST_ADMIN_BLOCKED` przy blokadzie.
- `run_auto_enforcement(session, vcs, *, now) -> AutoRunResult(downscoped, revoked, blocked)`,
  `change_mode(session, vcs, state, *, mode, now, actor_id) -> AutoRunResult | None`.
- `GET/PUT /api/v1/enforcement/mode` (`EnforcementModeRead`, `EnforcementModeUpdate`).

- [ ] Testy: `disabled` zeruje rekomendacje; downscope tylko z aktywnego `write`, ustawia `read`/`granted_at`/`expires_at`, audyt;
  revoke ustawia `is_active = false`, audyt, 409 na odebranej; brak uzasadnienia → 422; blokada → `LAST_ADMIN_BLOCKED` + 403;
  auto: `EXPIRED` + `DOWNSCOPE`/`REVOKE` wykonane jako `SYSTEM`, `ACTIVE`/`WARNING`/admin pominięte, blokada nie przerywa, drugi przebieg = 0;
  API: domyślnie `warning`, `PUT auto` wykonuje przebieg i audyt, `POST /time-travel` w trybie auto odbiera, reset demo → `warning`.
- [ ] RED → GREEN → kontrakt + typy TS → pełny zestaw → §5/§9 → commit `feat(lease): enforcement modes disabled/warning/auto (3.5)`.

### Task 6 (3.6): Endpointy

**Files:** Modify `lease_rules.py` (przedłużenie), `decision_service.py`, `lease_service.py` (statystyki), `backend/app/schemas/lease.py`
(`LeaseActivityStats`), `backend/app/schemas/__init__.py`, `backend/app/api/v1/router.py`, `shared/scenarios/uc-0{2,3,4,5}-*.json`, `README.md`;
Create `backend/app/api/v1/leases.py`; Test `backend/tests/domain/test_extension.py`, `backend/tests/services/test_apply_decision.py`,
`backend/tests/api/test_leases_api.py`, `backend/tests/api/test_leases_demo.py`.

**Produces:**
- `extension_base(expires_at, is_active, now) -> datetime`, `extension_expiry(base, *, lease_days, days=None, multiplier=None, until=None) -> datetime`.
- `apply_lease_decision(session, vcs, *, lease: Lease, decision: DecisionRequest, now: datetime, actor_id: int | None) -> Lease` (ADR 0011 §6).
- `decide_lease(session, vcs, *, lease_id, decision, now, actor_id) -> Lease` (404, 409 przy `PENDING`).
- `lease_activity_stats(session, lease_id, now) -> LeaseActivityStats`.
- `GET /api/v1/leases`, `GET /api/v1/leases/{id}`, `POST /api/v1/leases/{id}/decision`, `GET /api/v1/leases/{id}/activity-stats`.

- [ ] Testy domeny: preset 14 od `max(now, expires_at)`; odebrana od `now`; mnożnik 1.5 przy TTL 30 → +45 dni; `until_date` → następna północ UTC.
- [ ] Testy serwisu/API: `EXTEND` aktywnej (audyt `LEASE_EXTENDED`), `EXTEND` odebranej przywraca przez port; admin → 422;
  `until_date` nie później niż obecny koniec → 422; `PENDING` → 409; 404; `REVOKE` ostatniego admina → 403 i wpis `LAST_ADMIN_BLOCKED` w bazie;
  `activity-stats` liczy push/review/komentarze w oknie bez merge.
- [ ] Seed przez API (zegar `2026-10-03T12:00Z`): UC-2 (`WARNING`, 5, `DOWNSCOPE`; core-api `ACTIVE`, 29, `KEEP`),
  UC-3 (`WARNING`, 3, `KEEP`), UC-4 (29 → +25: `WARNING`, 4 → +5: `EXPIRED`, `REVOKE`).
- [ ] Poprawki scenariuszy: uc-02 (5, 29), uc-03 (3), uc-04 (29, 4, `REVOKE`), uc-05 (kroki 3–4: kamil → 204, tomasz → 403); `tests/scenarios` zielone.
- [ ] Kontrakt + typy TS; README „Stan prac”; DOCUMENTATION.md §6, §9, notatki dla zespołu; pełny zestaw;
  commit `feat(lease): lease list, decisions and activity stats endpoints (3.6)`.
