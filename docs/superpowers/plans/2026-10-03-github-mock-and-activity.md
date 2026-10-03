# Mock GitHuba i generator aktywności — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dostarczyć `api/github_mock` (prawdziwe ścieżki GitHub REST v3: orgs, teams, repos, collaborators, events), endpoint `/api/v1/simulation/time-travel` oraz deterministyczny generator historii aktywności pod scenariusze demo.

**Architecture:** Mock to cienka warstwa HTTP nad tabelami `User`, `Repository`, `Lease`, `ActivityEvent` (jedno źródło prawdy: `Lease` = collaborator). Logika w `services/`, mapowania ról i typów zdarzeń w `domain/`, routery tylko delegują (CODING_STANDARDS). Czas wyłącznie przez `TimeProvider`. Generator jest funkcją czystą (specyfikacje zdarzeń) + osobny persister, więc testuje się go bez bazy.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2.0 (async SQLite, `Mapped`/`mapped_column`), Pydantic v2, pytest + pytest-asyncio + httpx (`ASGITransport`).

**Spec:** `PRODUKT.md` (M7, UC-4, UC-5), `GLOSSARY.md`, `CODING_STANDARDS.md`, `docs/adr/0002`–`0004`, `PLAN.md` (Faza 1–2), `docs/superpowers/plans/2026-10-03-github-access-lease-governor.md` (Zadania 2–4, 6–8, 11 — ten plan konsumuje).

## Global Constraints

- Python `>=3.14`; backend: FastAPI + SQLAlchemy 2.0 async + `aiosqlite` + Pydantic v2 z `from_attributes = True`.
- Max **300 linii** na plik; jedno źródło prawdy dla utili (sprawdź `app/utils/` przed dodaniem helpera); jawne type hints dla argumentów i zwracanych wartości.
- TDD: Red → Green → Refactor; każde zadanie zaczyna się od testu, który widzimy jako FAIL.
- Zakaz `datetime.now()` w logice domenowej; czas z `time_provider.get_current_time()` (ADR 0003 pisze `now()`, CODING_STANDARDS i Zadanie 2 planu głównego `get_current_time()` — obowiązuje **`get_current_time()`**).
- Ścieżki mocka: prefiks `/api/v3`; kody `200`, `201`, `204`, `403`, `404`, `422`; błędy w formacie `{"message": "...", "documentation_url": "..."}`; nagłówki `X-GitHub-Media-Type`, `Link`, `X-RateLimit-*` (ADR 0004).
- Dzierżawione poziomy MVP: `write` (API `push`) i `read` (API `pull`); `admin` stały, nigdy w baseline, chroniony Last Admin Protection (ADR 0002, 0004).
- Do odnawiania dzierżaw liczą się wyłącznie `PushEvent`, `PullRequestReviewEvent`, `IssueCommentEvent` (ADR 0002); pozostałe typy to ścieżka post-MVP.
- Domyślny TTL 30 dni, okno ostrzegawcze 7 dni, okno baseline 30 dni, próg baseline 50%.
- Skoki czasu: dowolna liczba dni (presety UI +15/+30/+60; pitch z dokumentów +7/+25/+35 też musi działać) i reset.

## Decyzje podjęte przy planowaniu (do potwierdzenia przy review)

1. **Role:** wg ADR 0002. Mock przyjmuje wszystkie 5 nazw GitHuba w `PUT` (`pull|triage|push|maintain|admin`), ale zapisuje tylko `read|write|admin`: `triage→read`, `maintain→write`. `GET` zwraca więc `pull`/`push`/`admin` (stratne mapowanie, bo triage/maintain to ścieżka post-MVP).
2. **Typy zdarzeń:** `PushEvent`, `PullRequestEvent` (merge), `PullRequestReviewEvent`, `IssueCommentEvent`, `IssuesEvent` (label), `PublicEvent` (zmiana ustawień). Events API GitHuba **nie ma** typu „repo settings changed” (`RepositoryEvent` istnieje tylko jako webhook), a `PublicEvent` (repo upublicznione) jest realnym zdarzeniem ustawień, więc to go używamy.
3. **Stan collaboratorów = tabela `Lease`.** Zakładam (do potwierdzenia z właścicielem Zadania 3): `Lease.expires_at` jest nullable (admin = `None`), brak kolumny `is_active`, `DELETE` kasuje wiersz (historia w `AuditLog`, który zapisują serwisy z Zadania 10, nie mock).
4. **Własność plików:** `api/v1/simulation.py` (Zadanie 11 planu głównego) należy do **tego** planu (Zadanie 5); pozostałe routery v1 zostają przy właścicielu Zadania 11. Rejestracja routerów w `main.py` to po jednej linii `include_router`.
5. **Last Admin Protection** obejmuje też `PUT` obniżający ostatniego admina (nie tylko `DELETE`) oraz właściciela organizacji (`User.is_admin`, jedyny w org) — nie da się go usunąć/zdegradować w żadnym repo.
6. **Fixtures niezależne od seeda (Zadanie 4):** testy mocka używają własnej mini-organizacji, więc plan nie blokuje się na pracy innych.

## Struktura plików

| Plik | Odpowiedzialność |
| --- | --- |
| `backend/app/api/github_mock/router.py` | składa pod-routery, prefiks `/api/v3`, wspólne nagłówki |
| `backend/app/api/github_mock/orgs.py` | 2.1: members, teams, team members, repos |
| `backend/app/api/github_mock/collaborators.py` | 2.2 + 2.3: lista, permission, PUT, DELETE |
| `backend/app/api/github_mock/events.py` | 2.4: `GET /repos/{o}/{r}/events` |
| `backend/app/api/github_mock/http.py` | `GitHubError` + handlery, nagłówki, `paginate()` |
| `backend/app/schemas/github_payloads.py` | Pydantic: `GHUser`, `GHTeam`, `GHRepo`, `GHCollaborator`, `GHPermission`, `GHEvent` |
| `backend/app/domain/github_permissions.py` | mapowanie nazw GitHuba ↔ `LeaseRole` |
| `backend/app/domain/github_events.py` | typ → `required_permission`, `LEASE_RENEWING_EVENT_TYPES`, builder payloadów |
| `backend/app/services/github_mock_service.py` | odczyty org/teams/repos/collaborators |
| `backend/app/services/github_collaborator_service.py` | PUT/DELETE + Last Admin Protection |
| `backend/app/services/github_events_service.py` | lista zdarzeń (okno 90 dni, limit 300) |
| `backend/app/api/v1/simulation.py` | 2.5 time-travel |
| `backend/app/db/demo_scenarios.py` | stałe: login/repo, definicje scenariuszy A–D i baseline |
| `backend/app/db/activity_generator.py` | 2.6: `generate_activity_specs`, `persist_activity_specs` |
| `backend/tests/api/github_mock/conftest.py` | mini-org, `client` (httpx), zegar testowy |

## Review Focus

1. `PUT` obniżający jedynego admina repo / właściciela org → `403` (nie tylko `DELETE`).
2. Paginacja: `per_page=0`/`101` → `422`; `page` poza zakresem → `200 []`; nagłówek `Link` z `next`/`last`.
3. Po `+60` dni zdarzenia starsze niż 90 dni znikają z `/events`; nie więcej niż 300 pozycji.
4. `DELETE` nie-collaboratora i powtórny `DELETE` → `204` (idempotencja jak GitHub).
5. Time travel: `days<=0`, nie-liczba, oraz `days` razem z `reset` → `422`; kolejne skoki się kumulują; reset wraca do czasu bazowego.
6. Generator: dwa uruchomienia nie duplikują zdarzeń; zdarzenia „szumu” (merge/label/public) nie zmieniają liczby unikalnych aktywnych członków per repo względem samych 3 typów odnawiających.

---

## Zależności od planu głównego (konsumowane, nie implementowane tutaj)

`TimeProvider.get_current_time() -> datetime`, `.advance(days: int) -> datetime` (Zadanie 2; **dodajemy `reset() -> datetime`, jeśli brak**), modele `User(id, login, name, team, is_admin)`, `Repository(id, name, owner, default_branch, default_lease_duration_days)`, `Lease(id, user_id, repo_id, current_role, granted_at, expires_at)`, `ActivityEvent(id, user_id, repo_id, timestamp, action_type, required_permission)`, `init_db()` / async session (Zadanie 3), `app.main:app`. Dev-deps do dopisania w `pyproject.toml`: `httpx`, `pytest-asyncio` (`asyncio_mode = "auto"`).

### Task 1: Infrastruktura HTTP mocka i odczyty org/teams/repos (2.1)

**Files:**
- Create: `backend/app/api/github_mock/{__init__,router,orgs,http}.py`, `backend/app/schemas/github_payloads.py`, `backend/app/services/github_mock_service.py`
- Modify: `backend/app/main.py` (include_router + rejestracja handlerów)
- Test: `backend/tests/api/github_mock/conftest.py`, `backend/tests/api/github_mock/test_orgs.py`

**Interfaces:**
- Produces: `class GitHubError(Exception)(status: int, message: str, doc_path: str = "")`; `paginate(items: Sequence[T], request: Request, response: Response, page: int, per_page: int) -> list[T]`; `GitHubMockService(session: AsyncSession, clock: TimeProvider)` z `list_members(org) -> list[User]`, `list_teams(org) -> list[TeamRef]`, `list_team_members(org, slug) -> list[User]`, `list_repos(org) -> list[Repository]`, `get_repo(owner, repo) -> Repository`.
- Fixture `client` + mini-org: org `longtails`, `tomasz-admin` (`is_admin`), 2 DEV, 1 QA, 3 repo.

- [ ] **Step 1: Napisz testy** `test_list_org_members_returns_github_user_shape` (200; klucze `login,id,node_id,avatar_url,url,type=="User",site_admin`), `test_list_teams_returns_dev_and_qa_slugs` (`slug` ∈ {`dev`,`qa`}, klucze `id,name,slug,privacy,permission,members_url,repositories_url`), `test_list_team_members_filters_by_team`, `test_list_org_repos_shape` (`full_name=="longtails/core-api"`, `default_branch`, `owner.login`), `test_unknown_org_returns_github_404` (`{"message":"Not Found","documentation_url":...}`), `test_response_has_github_headers` (`X-GitHub-Media-Type`, `X-RateLimit-Limit`), `test_pagination_link_header_and_bounds` (per_page=2 → `Link` ma `rel="next"`; `per_page=101` → 422 w formacie GitHuba).
- [ ] **Step 2: Uruchom:** `cd backend && pytest tests/api/github_mock/test_orgs.py -q` — Expected: FAIL (404 / ImportError).
- [ ] **Step 3: Zaimplementuj** `GitHubError` + handler oraz handler `RequestValidationError` ograniczony do ścieżek `/api/v3` (zwraca `{"message":"Validation Failed","errors":[...],"documentation_url":...}`); dependency dodająca nagłówki; `paginate` (domyślnie `per_page=30`, max 100); endpointy `GET /orgs/{org}/members`, `/orgs/{org}/teams`, `/orgs/{org}/teams/{team_slug}/members`, `/orgs/{org}/repos`, `/repos/{owner}/{repo}`. Slug zespołu = `team.lower()`; id zespołu stałe (1=DEV, 2=QA). Brak uwierzytelniania (YAGNI).
- [ ] **Step 4: Uruchom ponownie** — Expected: wszystkie PASS.
- [ ] **Step 5: Commit** `feat(github-mock): org, team and repo read endpoints`

### Task 2: Collaborators i permission konkretnej osoby (2.2)

**Files:**
- Create: `backend/app/api/github_mock/collaborators.py`, `backend/app/domain/github_permissions.py`
- Modify: `backend/app/api/github_mock/router.py`, `backend/app/services/github_mock_service.py`, `backend/app/schemas/github_payloads.py`
- Test: `backend/tests/api/github_mock/test_collaborators_read.py`, `backend/tests/domain/test_github_permissions.py`

**Interfaces:**
- Produces: `LeaseRole = Literal["admin","write","read"]`; `to_github_permission(role: LeaseRole) -> Literal["admin","push","pull"]`; `to_role_name(role: LeaseRole) -> Literal["admin","write","read"]`; `from_github_permission(name: str) -> LeaseRole` (`triage→read`, `maintain→write`, nieznane → `ValueError`); serwis: `list_collaborators(owner, repo) -> list[CollaboratorView]`, `get_permission(owner, repo, username) -> CollaboratorView`.

- [ ] **Step 1: Napisz testy** `test_permission_mapping_table` (5 nazw GitHuba → 3 role; `bogus` → `ValueError`), `test_list_collaborators_includes_permissions_and_role_name` (admin: `permissions == {"admin":True,"maintain":True,"push":True,"triage":True,"pull":True}`; write/push: `admin:False, push:True, pull:True`; read: tylko `pull:True`; `role_name` ∈ {admin, write, read}), `test_get_permission_for_user` (`GET .../collaborators/{u}/permission` → `{"permission":"write"... }`: dla `push` GitHub zwraca `permission:"write"`, `role_name:"write"`, `user:{...}`), `test_get_permission_for_non_collaborator_returns_404`, `test_collaborators_paginated`.
- [ ] **Step 2: Uruchom:** `cd backend && pytest tests/domain/test_github_permissions.py tests/api/github_mock/test_collaborators_read.py -q` — Expected: FAIL.
- [ ] **Step 3: Zaimplementuj** mapowanie i endpointy `GET /repos/{owner}/{repo}/collaborators` oraz `GET /repos/{owner}/{repo}/collaborators/{username}/permission`; kolaboratorzy = wiersze `Lease` danego repo złączone z `User`.
- [ ] **Step 4: Uruchom ponownie** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(github-mock): collaborators and permission lookup`

### Task 3: PUT / DELETE collaborator + Last Admin Protection (2.3)

**Files:**
- Create: `backend/app/services/github_collaborator_service.py`
- Modify: `backend/app/api/github_mock/collaborators.py`
- Test: `backend/tests/api/github_mock/test_collaborators_write.py`

**Interfaces:**
- Consumes: `from_github_permission`, `TimeProvider`.
- Produces: `GitHubCollaboratorService.set_permission(owner, repo, username, permission: str) -> Literal["created","updated"]`; `.remove(owner, repo, username) -> None`; rzuca `GitHubError(403|404|422)`.

- [ ] **Step 1: Napisz testy** `test_put_new_collaborator_returns_201_with_invitation_shape` (`id`, `repository`, `invitee`, `permissions`), `test_put_existing_collaborator_changes_level_returns_204` (potem `GET .../permission` zwraca nowy poziom; `granted_at == clock.now`, `expires_at == now + 30 dni` dla write/read, `None` dla admin), `test_put_invalid_permission_returns_422`, `test_put_unknown_user_returns_404`, `test_delete_returns_204_and_removes`, `test_delete_non_collaborator_is_idempotent_204`, `test_delete_last_repo_admin_returns_403` (`message == "Cannot remove the last administrator of the repository"`, jest `documentation_url`), `test_put_demoting_last_repo_admin_returns_403`, `test_delete_or_demote_sole_org_owner_returns_403` (komunikat `... of the organization`), `test_delete_admin_when_second_admin_exists_succeeds`, `test_ttl_uses_repo_default_lease_duration_days`.
- [ ] **Step 2: Uruchom:** `cd backend && pytest tests/api/github_mock/test_collaborators_write.py -q` — Expected: FAIL (405/404).
- [ ] **Step 3: Zaimplementuj** `PUT` (body `{"permission": str}`) i `DELETE`; guard sprawdza najpierw właściciela org, potem ostatniego admina repo, dla `DELETE` i dla `PUT` obniżającego z `admin`. Mock **nie** zapisuje `AuditLog` (robią to serwisy decyzyjne).
- [ ] **Step 4: Uruchom ponownie** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(github-mock): grant, change and revoke collaborator with last-admin guard`

### Task 4: Endpoint zdarzeń aktywności (2.4)

**Files:**
- Create: `backend/app/domain/github_events.py`, `backend/app/services/github_events_service.py`, `backend/app/api/github_mock/events.py`
- Modify: `backend/app/api/github_mock/router.py`, `backend/app/schemas/github_payloads.py`
- Test: `backend/tests/domain/test_github_events.py`, `backend/tests/api/github_mock/test_events.py`

**Interfaces:**
- Produces: `EVENT_REQUIRED_PERMISSION: dict[str, LeaseRole]` = `PushEvent→write`, `PullRequestEvent→write`, `PullRequestReviewEvent→read`, `IssueCommentEvent→read`, `IssuesEvent→read`, `PublicEvent→admin`; `LEASE_RENEWING_EVENT_TYPES: frozenset[str]` (3 typy z ADR 0002) — **importuje je `lease_service` (Zadanie 8 planu głównego)**; `build_event_payload(event: ActivityEvent, repo: Repository, user: User) -> dict[str, Any]` (deterministyczny: `sha`/`number`/`push_id` wyliczane z `event.id`); `GitHubEventsService.list_events(owner, repo, now) -> list[EventView]`.

- [ ] **Step 1: Napisz testy** `test_event_type_permission_table_and_renewing_set` (dokładnie 3 typy odnawiające), `test_payload_shapes` (Push: `ref`, `head`, `before`, `size>=1`, `commits[].sha`; PullRequest: `action=="closed"`, `pull_request.merged is True`; Review: `action=="created"`, `review.state`; IssueComment: `issue.number`, `comment.body`; Issues: `action=="labeled"`, `label.name`; Public: `payload == {}`), `test_payload_is_deterministic`, `test_events_endpoint_shape_and_order` (`id` jako string, `type`, `actor.login`, `repo.name=="longtails/core-api"`, `created_at` w ISO `Z`, malejąco po czasie), `test_events_window_is_90_days_after_time_travel` (po `advance(60)` zdarzenia starsze niż 90 dni znikają), `test_events_capped_at_300`, `test_events_unknown_repo_404`, `test_events_paginated`.
- [ ] **Step 2: Uruchom:** `cd backend && pytest tests/domain/test_github_events.py tests/api/github_mock/test_events.py -q` — Expected: FAIL.
- [ ] **Step 3: Zaimplementuj** mapę, builder i `GET /repos/{owner}/{repo}/events`. Wszystkie zapisane `PullRequestEvent` to merge’e, a `IssuesEvent` to `labeled` (zapis tylko takich).
- [ ] **Step 4: Uruchom ponownie** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(github-mock): activity events endpoint with GitHub payloads`

### Task 5: `/api/v1/simulation/time-travel` (2.5)

**Files:**
- Create: `backend/app/api/v1/simulation.py`, `backend/app/schemas/simulation.py`
- Modify: `backend/app/core/time_provider.py` (tylko `reset()`, jeśli brak), `backend/app/main.py`
- Test: `backend/tests/api/test_simulation.py`

**Interfaces:**
- Produces: `class TimeTravelRequest(BaseModel)`: `days: int | None = Field(None, ge=1, le=365)`, `reset: bool = False` (dokładnie jedno z dwóch); `class SimulationClock(BaseModel)`: `simulated_now: datetime`, `offset_seconds: int`. `POST /api/v1/simulation/time-travel` i `GET /api/v1/simulation/time-travel` (stan zegara dla TopBar) → `SimulationClock`. Zegar jest singletonem wstrzykiwanym przez dependency, stan w pamięci (restart = reset).

- [ ] **Step 1: Napisz testy** `test_post_advance_15_30_60` (parametryzowane; `offset_seconds == days*86400`), `test_advances_accumulate` (+15 potem +30 → 45 dni), `test_reset_returns_to_base_time` (`offset_seconds == 0`), `test_get_returns_current_clock`, `test_invalid_bodies_return_422` (`days=0`, `-5`, `"x"`, `366`, `{}`, `{"days":5,"reset":true}`), `test_other_services_see_shifted_time` (po skoku `/events` używa nowego `now`).
- [ ] **Step 2: Uruchom:** `cd backend && pytest tests/api/test_simulation.py -q` — Expected: FAIL (404).
- [ ] **Step 3: Zaimplementuj** router (logika w `TimeProvider`, router tylko waliduje i deleguje) i dopisz `include_router`.
- [ ] **Step 4: Uruchom ponownie** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(simulation): time-travel endpoint`

### Task 6: Generator historii aktywności pod scenariusze demo (2.6)

**Files:**
- Create: `backend/app/db/demo_scenarios.py`, `backend/app/db/activity_generator.py`
- Test: `backend/tests/db/test_activity_generator.py`

**Interfaces:**
- Consumes: `LEASE_RENEWING_EVENT_TYPES`, `EVENT_REQUIRED_PERMISSION`.
- Produces: `@dataclass(frozen=True) ActivityEventSpec(login: str, repo: str, action_type: str, age_days: float)`; `generate_activity_specs(seed: int = 2026) -> list[ActivityEventSpec]` (czysta, deterministyczna, `random.Random(seed)`); `async persist_activity_specs(session: AsyncSession, specs: Sequence[ActivityEventSpec], now: datetime) -> int` (zwraca liczbę **nowych** wierszy; `timestamp = now - age_days`; `required_permission` z mapy; **bez** efektów ubocznych na `Lease` — to nie `record_activity`). Stałe: org `longtails` (do uzgodnienia z seedem, Zadanie 4), loginy `tomasz-admin`, `dev-kamil`, `qa-marta`, `dev-new` + reszta jako `dev-01..dev-10`, `qa-01..qa-05`.

Zawartość scenariuszy (przy TTL 30 / okno 7; `age` = dni od „teraz” t0):

| Scenariusz | Dane | t0 | +15 | +30 | +60 |
| --- | --- | --- | --- | --- | --- |
| **A** `dev-kamil`@`payment-gw` (write) | ostatni `PushEvent` age 18; review age 2, 6, 11; comment age 4 | ACTIVE | write wygasa → propozycja `read` | revoke | revoke |
| **B** `qa-marta`@`core-api` (read) | ostatni `IssueCommentEvent` age 27, brak niższych | WARNING (3 dni) | EXPIRED → revoke | revoke | revoke |
| **C** `legacy-reports` | **zero** zdarzeń w 90 dniach | brak aktywności | — | — | — |
| **D** `dev-new` | zero zdarzeń | — | — | — | — |
| Tło DEV (`dev-01..10`) | ostatni push age = 1,3,5,…,19 (rozrzut) | wszyscy ACTIVE | 4 ACTIVE, 3 WARNING, reszta EXPIRED | wszyscy EXPIRED | — |

Baseline (DEV = 12 osób z `dev-new`; liczby odporne na to, czy newcomer wlicza się do mianownika): `core-api` 9/12 push, `auth-service` 8/12 push, `frontend-app` 8/12 push → `write`; `notifications` 6/12 push (**dokładnie 50%**, 6/11 też ≥50%) → `write`; `data-pipeline` 5/12 (**41,7%**, 5/11 = 45% — oba poniżej) → brak; `mobile-app` 7/12 tylko review/komentarze → `read`; `payment-gw` 3/12 → brak. QA (6 osób): `frontend-app` 4/6 comment/review → `read`; `core-api` 3/6 (**50%**) → `read`; `auth-service` 2/6 → brak. Admin `tomasz-admin`: pushe w `infra-terraform` + jeden `PublicEvent` w `docs-site`. Szum: `PullRequestEvent` (merge) w `core-api` oraz `IssuesEvent` (label) w `frontend-app`, **tylko od użytkowników już aktywnych w tym repo przez typy odnawiające**, żeby progi baseline nie zależały od tego, które typy baseline liczy.

- [ ] **Step 1: Napisz testy** `test_generation_is_deterministic` (dwa wywołania → równe listy; inny seed → inna lista), `test_scenario_a_ages` (dokładnie wartości z tabeli, brak `PushEvent` z age < 18), `test_scenario_b_single_comment_age_27`, `test_scenario_c_and_d_have_no_events`, `test_background_dev_push_ages_spread` (zbiór ostatnich pushy = {1,3,…,19}), `test_baseline_counts_match_spec` (unikalni loginy per repo/zespół: 9,8,8,6,5,7,3 oraz 4,3,2), `test_noise_events_do_not_change_baseline_membership` (zbiór aktywnych per repo liczony dla wszystkich typów == liczony dla `LEASE_RENEWING_EVENT_TYPES`), `test_all_specs_have_known_types_and_ages_within_90_days`, `test_persist_inserts_rows_with_required_permission_and_is_idempotent` (druga persystencja → `0`, liczba wierszy bez zmian; `Lease` bez zmian), `test_persist_uses_injected_now`.
- [ ] **Step 2: Uruchom:** `cd backend && pytest tests/db/test_activity_generator.py -q` — Expected: FAIL.
- [ ] **Step 3: Zaimplementuj** `demo_scenarios.py` (dane jako stałe) i generator; `rng` służy wyłącznie do jittera godzin w obrębie dnia (nie zmienia `age_days` zaokrąglonego do dnia, żeby tabela powyżej pozostała prawdziwa). Idempotencja persistera: pominięcie wiersza o tym samym `(user_id, repo_id, timestamp, action_type)`.
- [ ] **Step 4: Uruchom ponownie** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(demo): deterministic activity history generator for demo scenarios`

### Task 7: Kontrakt end-to-end mock ↔ silnik (po Zadaniu 8 planu głównego)

**Files:**
- Create: `backend/tests/integration/test_github_mock_contract.py`

**Interfaces:**
- Consumes: `seed_demo_data` (Zadanie 4), `persist_activity_specs`, `evaluate_lease_status` (Zadanie 8), wszystkie endpointy z Tasks 1–5.

- [ ] **Step 1: Napisz testy** `test_put_then_get_permission_roundtrip`, `test_delete_then_collaborators_list_excludes_user`, `test_scenario_timeline_matches_table` (po `persist_activity_specs` i skokach +15/+30/+60 status/rekomendacja scenariuszy A i B zgadza się z tabelą z Task 6), `test_pitch_jumps_25_and_35_work`, `test_last_admin_demo_step_returns_403` (krok 5 pitch flow), `test_events_endpoint_matches_activity_table_rows`.
- [ ] **Step 2: Uruchom:** `cd backend && pytest tests/integration/test_github_mock_contract.py -q` — Expected: FAIL do czasu wpięcia seeda i silnika.
- [ ] **Step 3: Napraw wyłącznie błędy integracji** (bez duplikowania logiki domenowej w routerach); jeśli tabela z Task 6 rozjeżdża się z silnikiem, zmieniamy dane generatora, nie reguły silnika.
- [ ] **Step 4: Uruchom pełny zestaw:** `cd backend && pytest -q` — Expected: wszystko PASS, kod wyjścia 0.
- [ ] **Step 5: Commit** `test(github-mock): end-to-end contract with lease engine`

---

## Self-Review

- **Pokrycie:** 2.1→Task 1, 2.2→Task 2, 2.3→Task 3, 2.4→Task 4, 2.5→Task 5, 2.6→Task 6; UC-4, UC-5, M7 pokryte; ADR 0004 (kody, nagłówki, format błędów, last admin) w Tasks 1 i 3.
- **Spójność typów:** `LeaseRole`, `LEASE_RENEWING_EVENT_TYPES`, `EVENT_REQUIRED_PERMISSION`, `ActivityEventSpec` definiowane raz i tylko konsumowane.
- **Proporcja:** treść to sygnatury, nazwy testów i wartości ze specyfikacji; brak ciał funkcji.

## Otwarte punkty do uzgodnienia z zespołem

1. `Lease.expires_at` nullable i brak `is_active` (Zadanie 3).
2. Nazwa organizacji i loginy demo wspólne z seedem (Zadanie 4).
3. `lease_service` importuje `LEASE_RENEWING_EVENT_TYPES` zamiast liczyć każde zdarzenie o wystarczającym poziomie (Zadanie 8).
4. Właściciel `api/v1/simulation.py` (Task 5 tego planu vs Zadanie 11).
5. Sprzeczności w dokumentach niewpływające na ten plan, ale warte naprawy: `admin` dzierżawiony w planie głównym vs stały w ADR 0002; `now()` vs `get_current_time()`; scenariusz A `write→read` vs `admin→push`; `event_type/required_level` (PLAN.md) vs `action_type/required_permission`.

## Odchylenia wprowadzone podczas implementacji

Wykonano wszystkie 7 zadań (112 testów). Zmiany względem tekstu planu:

1. **Task 2:** `GET .../collaborators/{u}/permission` dla istniejącego użytkownika bez dostępu zwraca `200` z `permission: "none"` (jak GitHub), a nie `404`; `404` tylko dla nieznanego loginu (test `test_get_permission_for_non_collaborator_is_none`).
2. **Task 3:** `PUT` tym samym poziomem to no-op (nie przedłuża dzierżawy); dodano testy `test_put_same_role_is_noop`, `test_put_admin_has_no_expiry`, `test_put_default_permission_is_push`, `test_put_triage_and_maintain_collapse_to_read_and_write`.
3. **Task 1/5:** fixtures przeniesione do `tests/api/conftest.py` (współdzielone z testami symulacji); dodano `api/github_mock/deps.py` (zależności FastAPI) i `utils/dates.py` (`iso_z`, jedno źródło formatowania dat).
4. **Task 6:** QA ma 6 osób (`qa-marta` + `qa-01..05`); dodano `db/demo_data.py` (`ensure_population`, `load_demo_data`, wyprowadzanie leasów z historii) oraz podpięcie seeda do startu aplikacji. `load_demo_data` jest no-op, gdy w bazie są już zdarzenia (restart nie przesuwa historii). `ActivityEventSpec` ma `age_days: int` i `hour_offset: int`.
5. **Task 7:** silnik dzierżaw nie istniał, więc test kontraktowy używa lokalnego oracle zapisanego z reguł ADR 0002 (do podmiany na `lease_service`).
6. Fundament z planu głównego (Zadania 1–3: `pyproject.toml`, `TimeProvider` z `reset()`, modele `User/Repository/Lease/ActivityEvent`, sesja async, `create_app`) został dodany w minimalnym zakresie, bo repo go jeszcze nie miało. Modele `Appeal` i `AuditLog` nie powstały.
