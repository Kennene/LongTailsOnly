# PLAN IMPLEMENTACJI: GitHub Access Lease Governor (MVP Demo)

Projekt jest realizowany jako **Single Page Application (SPA)**:
- **Frontend**: React 19 + React Compiler + TypeScript + Vite + Tailwind CSS + shadcn/ui + `@xyflow/react`.
- **Backend**: Python 3.14 + FastAPI + SQLAlchemy 2.0 (async SQLite) + Pydantic v2.
- **Mock**: REST API GitHuba v3 z symulacją zdarzeń i sterowaniem czasem (`TimeProvider`).

Wykonuj zadania po kolei. Każde zadanie ma własny zakres plików i test weryfikujący dostarczane zachowanie. Polecenia testowe uruchamiaj z katalogu wskazanego przy zadaniu.

## Faza 1: Fundament backendowy i silnik dzierżawy

### Zadanie 1: Szkielet backendu i konfiguracja testów

**Pliki:**
- Utwórz: `backend/pyproject.toml`
- Utwórz: `backend/app/__init__.py`
- Utwórz: `backend/app/main.py`
- Utwórz: `backend/tests/__init__.py`
- Test: `backend/tests/test_project_setup.py`

**Interfejs:** `app.main:app` udostępnia instancję FastAPI; testy backendu uruchamia `pytest`.

- [ ] **Krok 1: Napisz test `test_pyproject_declares_backend_dependencies_and_pytest`** sprawdzający Python `>=3.14`, zależności `fastapi`, `uvicorn`, `sqlalchemy`, `aiosqlite`, `pydantic` oraz konfigurację `pytest`.
- [ ] **Krok 2: Uruchom test przed konfiguracją.**

Uruchom z `backend/`: `python -m unittest discover -s tests -p test_project_setup.py -v`
Oczekiwane: FAIL, ponieważ `pyproject.toml` jeszcze nie istnieje.

- [ ] **Krok 3: Dodaj konfigurację projektu i pustą aplikację FastAPI w wymienionych plikach.**
- [ ] **Krok 4: Zweryfikuj konfigurację i instalację zależności.**

Uruchom z `backend/`: `python -m unittest tests/test_project_setup.py -v && python -m pip install -e '.[dev]' && pytest -q`
Oczekiwane: test konfiguracji PASS, instalacja zakończona powodzeniem, `pytest` kończy się kodem 0.

### Zadanie 2: Konfiguracja aplikacji i zegar symulowany

**Pliki:**
- Utwórz: `backend/app/core/config.py`
- Utwórz: `backend/app/core/time_provider.py`
- Test: `backend/tests/core/test_time_provider.py`

**Interfejs:** `TimeProvider.get_current_time() -> datetime` zwraca UTC plus skonfigurowany offset; `TimeProvider.advance(days: int) -> datetime` przesuwa zegar symulowany.

- [ ] **Krok 1: Napisz testy `test_current_time_uses_utc_and_offset` i `test_advance_moves_clock_by_requested_days`** sprawdzające czas bazowy UTC, offset oraz skok o 7 dni.
- [ ] **Krok 2: Uruchom:** `cd backend && pytest tests/core/test_time_provider.py -q`
Oczekiwane: FAIL, testowany moduł lub metody zegara nie istnieją.
- [ ] **Krok 3: Zaimplementuj konfigurację i zegar w wymienionych plikach.** Logika domenowa nie może wywoływać bezpośrednio `datetime.now()`.
- [ ] **Krok 4: Uruchom ponownie to samo polecenie.**
Oczekiwane: oba testy PASS.

### Zadanie 3: Modele ORM i inicjalizacja bazy

**Pliki:**
- Utwórz: `backend/app/models/__init__.py`, `backend/app/models/user.py`, `backend/app/models/repository.py`, `backend/app/models/lease.py`, `backend/app/models/activity.py`, `backend/app/models/appeal.py`, `backend/app/models/audit_log.py`
- Utwórz: `backend/app/db/__init__.py`, `backend/app/db/session.py`, `backend/app/db/base.py`
- Test: `backend/tests/db/test_models.py`

**Interfejs:** modele `User`, `Repository`, `Lease`, `ActivityEvent`, `Appeal` i `AuditLog` są mapowane przez SQLAlchemy 2.0; `app.db.session.init_db()` tworzy schemat SQLite.

- [ ] **Krok 1: Napisz testy `test_models_persist_required_fields` i `test_init_db_creates_tables`** sprawdzające pola z tej listy: `User(id, login, name, team, is_admin)`, `Repository(id, name, owner, default_branch)`, `Lease(id, user_id, repo_id, current_role, expires_at, granted_at)`, `ActivityEvent(id, user_id, repo_id, timestamp, action_type, required_permission)`, `Appeal(lease_id, user_id, repo_id, requested_role, justification, status, created_at, resolved_at)` oraz `AuditLog(timestamp, actor_type, actor_id, action, target, details, justification)`. `ActivityEvent.user_id` i `repo_id` są indeksowanymi kluczami obcymi; `required_permission` używa hierarchii ról z ADR 0002. `Lease` nie przechowuje pól `last_activity_at` ani `last_activity_type`.
- [ ] **Krok 2: Uruchom:** `cd backend && pytest tests/db/test_models.py -q`
Oczekiwane: FAIL z powodu brakujących modeli lub tabel.
- [ ] **Krok 3: Zaimplementuj modele, sesję async SQLite i inicjalizację schematu.**
- [ ] **Krok 4: Uruchom ponownie to samo polecenie.**
Oczekiwane: oba testy PASS, tabele są widoczne w bazie testowej.

### Zadanie 4: Deterministyczne dane demonstracyjne

**Pliki:**
- Utwórz: `backend/app/db/seed.py`
- Test: `backend/tests/db/test_seed.py`

**Interfejs:** `seed_demo_data(session) -> None` tworzy deterministyczny zestaw organizacji, użytkowników, zespołów, repozytoriów, dzierżaw, zdarzeń aktywności i scenariuszy.

- [ ] **Krok 1: Napisz testy `test_seed_creates_demo_population` i `test_seed_is_idempotent`** sprawdzające 1 organizację, admina `tomasz-admin`, zespoły DEV/QA, 10 repozytoriów, deterministyczne zdarzenia `ActivityEvent` oraz cztery przypadki: (A) developer z `admin`, który wykonuje tylko zdarzenia `push`; (B) QA z dostępem wygasającym za 3 dni; (C) nieużywane repozytorium bez zdarzeń w ostatnich 30 dniach; (D) nowy developer bez dostępów.
- [ ] **Krok 2: Uruchom:** `cd backend && pytest tests/db/test_seed.py -q`
Oczekiwane: FAIL, ponieważ funkcja seeda nie istnieje.
- [ ] **Krok 3: Zaimplementuj seed deterministyczny, używając zegara wstrzykiwanego zamiast zegara systemowego.**
- [ ] **Krok 4: Uruchom ponownie to samo polecenie.**
Oczekiwane: oba testy PASS; ponowne seedowanie nie duplikuje rekordów.

## Faza 2: Logika domenowa i endpointy API

### Zadanie 5: Schematy API i mapowanie ról GitHuba

**Pliki:**
- Utwórz: `backend/app/schemas/__init__.py`, `backend/app/schemas/github.py`, `backend/app/schemas/lease.py`, `backend/app/schemas/appeal.py`
- Utwórz: `backend/app/domain/roles.py`
- Test: `backend/tests/domain/test_roles.py`
- Test: `backend/tests/schemas/test_api_schemas.py`

**Interfejs:** `Role` definiuje `admin > maintain > push > triage > pull`; schematy Pydantic v2 walidują dane żądań i odpowiedzi API.

- [ ] **Krok 1: Napisz testy `test_role_order_and_write_read_mapping` oraz `test_api_schemas_reject_invalid_role_and_status`** sprawdzające kolejność ról, mapowanie `push` do write, `triage`/`pull` do read i odrzucanie nieznanych wartości.
- [ ] **Krok 2: Uruchom:** `cd backend && pytest tests/domain/test_roles.py tests/schemas/test_api_schemas.py -q`
Oczekiwane: FAIL, ponieważ moduły nie istnieją.
- [ ] **Krok 3: Dodaj enum ról i modele request/response zgodne z ADR 0001 i ADR 0002.**
- [ ] **Krok 4: Uruchom ponownie to samo polecenie.**
Oczekiwane: wszystkie testy PASS.

### Zadanie 6: Odczytowe endpointy mocka GitHuba

**Pliki:**
- Utwórz: `backend/app/api/github_mock/__init__.py`
- Utwórz: `backend/app/api/github_mock/router.py`
- Utwórz: `backend/app/services/github_mock_service.py`
- Zmień: `backend/app/main.py`
- Test: `backend/tests/api/test_github_mock_reads.py`

**Interfejs:** router udostępnia `GET /api/v3/orgs/{org}/members`, `GET /api/v3/repos/{owner}/{repo}/collaborators` i `GET /api/v3/repos/{owner}/{repo}/events`; endpoint zdarzeń odczytuje rekordy `ActivityEvent` repozytorium.

- [ ] **Krok 1: Napisz testy `test_list_org_members`, `test_list_repo_collaborators` i `test_list_repo_events`** weryfikujące kody odpowiedzi oraz format JSON dla danych z seeda.
- [ ] **Krok 2: Uruchom:** `cd backend && pytest tests/api/test_github_mock_reads.py -q`
Oczekiwane: FAIL, endpointy zwracają 404.
- [ ] **Krok 3: Dodaj odczytowe endpointy i podłącz router do aplikacji.**
- [ ] **Krok 4: Uruchom ponownie to samo polecenie.**
Oczekiwane: wszystkie testy PASS; odpowiedzi zawierają seeded members, collaborators i events.

### Zadanie 7: Zmiana dostępu i ochrona ostatniego administratora

**Pliki:**
- Zmień: `backend/app/services/github_mock_service.py`
- Zmień: `backend/app/api/github_mock/router.py`
- Test: `backend/tests/api/test_github_mock_mutations.py`

**Interfejs:** router obsługuje `PUT /api/v3/repos/{owner}/{repo}/collaborators/{username}` i `DELETE` na tej samej ścieżce; próba usunięcia ostatniego admina zwraca HTTP 403.

- [ ] **Krok 1: Napisz testy `test_put_changes_collaborator_permission`, `test_delete_removes_collaborator` i `test_delete_last_repository_admin_returns_403`**; dodaj analogiczny przypadek dla ostatniego admina organizacji.
- [ ] **Krok 2: Uruchom:** `cd backend && pytest tests/api/test_github_mock_mutations.py -q`
Oczekiwane: FAIL, ponieważ endpointy mutujące nie istnieją.
- [ ] **Krok 3: Zaimplementuj zmianę/usuwanie dostępu i kontrolę ostatniego administratora dla repozytorium oraz organizacji.**
- [ ] **Krok 4: Uruchom ponownie to samo polecenie.**
Oczekiwane: wszystkie testy PASS; zabronione usunięcia zwracają dokładnie 403.

### Zadanie 8: Cykl życia dzierżawy i asymetryczne odnawianie

**Pliki:**
- Utwórz: `backend/app/services/lease_service.py`
- Test: `backend/tests/services/test_lease_service.py`

**Interfejs:** `record_activity(user_id, repo_id, action_type, required_permission, occurred_at) -> ActivityEvent` zapisuje każde zdarzenie bez nadpisywania historii; `occurred_at` pochodzi z `TimeProvider`, a dzierżawę odnawia tylko wtedy, gdy wymagany poziom zdarzenia jest co najmniej równy `current_role` (ustawia wtedy `expires_at = occurred_at + 30 dni`). `evaluate_lease_status(lease, now) -> LeaseStatus` wyznacza `ACTIVE`, `WARNING` (pozostało najwyżej 7 dni) albo `EXPIRED` na podstawie historii `ActivityEvent`.

- [ ] **Krok 1: Napisz testy `test_status_active_warning_expired_boundaries`, `test_push_does_not_renew_admin_lease`, `test_recent_lower_role_activity_recommends_downscope`, `test_no_recent_activity_recommends_revoke` i `test_admin_activity_renews_admin_lease`** dla 30-dniowego okresu i 7-dniowego okna ostrzegawczego.
- [ ] **Krok 2: Uruchom:** `cd backend && pytest tests/services/test_lease_service.py -q`
Oczekiwane: FAIL, ponieważ serwis dzierżaw nie istnieje.
- [ ] **Krok 3: Zaimplementuj zapis zdarzeń i ewaluację przez `TimeProvider` zgodnie z hierarchią z ADR 0002. Dla dzierżawy sprawdź najnowsze zdarzenie o poziomie wymaganym co najmniej równym `current_role` z ostatnich 30 dni; brak takiego zdarzenia oznacza wygaśnięcie tego poziomu. Następnie sprawdź najnowsze zdarzenie niższego poziomu z tego okna: zaproponuj down-scope do jego `required_permission`, a jeśli go brak — revoke.**
- [ ] **Krok 4: Uruchom ponownie to samo polecenie.**
Oczekiwane: wszystkie testy PASS, w tym granice 7 i 0 dni.

### Zadanie 9: Baseline zespołu

**Pliki:**
- Utwórz: `backend/app/services/baseline_service.py`
- Test: `backend/tests/services/test_baseline_service.py`

**Interfejs:** `get_team_baseline(team_id, now) -> list[BaselineEntry]` oblicza aktywność z rekordów `ActivityEvent` z przedziału `[now - 30 dni, now]` i proponuje najniższy wystarczający poziom zarejestrowanej aktywności, nigdy `admin`.

- [ ] **Krok 1: Napisz testy `test_baseline_requires_half_of_team`, `test_baseline_uses_lowest_sufficient_role` i `test_baseline_never_proposes_admin`** na podstawie zdarzeń `ActivityEvent`; próg liczy unikalnych członków zespołu aktywnych w repozytorium w ostatnich 30 dniach, a poziom wyznacza się z wymaganych uprawnień zdarzeń bez `admin`.
- [ ] **Krok 2: Uruchom:** `cd backend && pytest tests/services/test_baseline_service.py -q`
Oczekiwane: FAIL, ponieważ serwis baseline nie istnieje.
- [ ] **Krok 3: Zaimplementuj liczenie unikalnych aktywnych `user_id` względem liczby członków zespołu; uwzględnij repozytorium przy progu co najmniej 50% i wyznacz najniższy wystarczający poziom dla aktywności większości, pomijając `admin`.**
- [ ] **Krok 4: Uruchom ponownie to samo polecenie.**
Oczekiwane: wszystkie testy PASS; próg jest spełniony dokładnie przy 50%, a `admin` nigdy nie występuje w wyniku.

### Zadanie 10: Odwołania i dziennik audytowy

**Pliki:**
- Utwórz: `backend/app/services/appeal_service.py`
- Utwórz: `backend/app/services/audit_service.py`
- Test: `backend/tests/services/test_appeal_service.py`
- Test: `backend/tests/services/test_audit_service.py`

**Interfejs:** `submit_appeal(lease_id, user_id, justification) -> Appeal` wymaga niepustego, nowego uzasadnienia; `resolve_appeal(appeal_id, decision, duration) -> Appeal` zapisuje decyzję; `write_audit_event(...) -> AuditLog` zapisuje aktora, akcję, cel, czas i uzasadnienie.

- [ ] **Krok 1: Napisz testy `test_appeal_requires_unique_justification`, `test_admin_can_extend_or_revoke_appeal` i `test_audit_event_records_actor_and_decision`.**
- [ ] **Krok 2: Uruchom:** `cd backend && pytest tests/services/test_appeal_service.py tests/services/test_audit_service.py -q`
Oczekiwane: FAIL, ponieważ serwisy nie istnieją.
- [ ] **Krok 3: Zaimplementuj obsługę odwołań i niezmienny zapis audytowy; każdą decyzję przedłużenia, odebrania lub down-scope rejestruj przez `audit_service`.**
- [ ] **Krok 4: Uruchom ponownie to samo polecenie.**
Oczekiwane: wszystkie testy PASS; powtórzone uzasadnienie nie tworzy kolejnego odwołania.

### Zadanie 11: API dzierżaw, odwołań, baseline i sterowania czasem

**Pliki:**
- Utwórz: `backend/app/api/v1/__init__.py`, `backend/app/api/v1/leases.py`, `backend/app/api/v1/appeals.py`, `backend/app/api/v1/baseline.py`, `backend/app/api/v1/simulation.py`, `backend/app/api/v1/audit.py`
- Utwórz: `backend/app/api/v1/router.py`
- Zmień: `backend/app/main.py`
- Test: `backend/tests/api/test_v1_endpoints.py`

**Interfejs:** API v1 udostępnia `GET /api/v1/leases`, `POST /api/v1/leases/{lease_id}/decision`, `GET /api/v1/baseline/{team_id}`, `POST /api/v1/appeals`, `POST /api/v1/appeals/{appeal_id}/decision`, `GET /api/v1/audit` oraz `POST /api/v1/simulation/time-travel`.

- [ ] **Krok 1: Napisz testy `test_list_leases_and_baseline`, `test_submit_and_resolve_appeal`, `test_admin_lease_decision_and_audit_read` oraz `test_time_travel_advance_and_reset`** weryfikujące kody HTTP i schematy odpowiedzi.
- [ ] **Krok 2: Uruchom:** `cd backend && pytest tests/api/test_v1_endpoints.py -q`
Oczekiwane: FAIL, ponieważ endpointy v1 nie są podłączone.
- [ ] **Krok 3: Dodaj routery v1, delegując logikę do serwisów z zadań 8–10.**
- [ ] **Krok 4: Uruchom ponownie to samo polecenie.**
Oczekiwane: wszystkie testy PASS; przesunięcie o 7 dni i reset zegara są widoczne w odpowiedzi.

## Faza 3: Frontend SPA

### Zadanie 12: Szkielet frontendu, klient API i pasek czasu

**Pliki:**
- Utwórz: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`
- Utwórz: `frontend/src/main.tsx`, `frontend/src/App.tsx`
- Utwórz: `frontend/src/api/client.ts`, `frontend/src/api/types.ts`
- Utwórz: `frontend/src/components/TimeTravelController.tsx`
- Test: `frontend/src/components/TimeTravelController.test.tsx`

**Interfejs:** klient typed REST obsługuje API v1; `TimeTravelController` wyświetla symulowany czas, wywołuje skok o 7/30 dni i reset.

- [ ] **Krok 1: Skonfiguruj test runner Vitest oraz napisz `test_time_travel_controller_calls_simulation_api`** sprawdzający wywołania skoku i resetu.
- [ ] **Krok 2: Uruchom z `frontend/`: `npm test -- --run src/components/TimeTravelController.test.tsx`**
Oczekiwane: FAIL, komponent nie istnieje.
- [ ] **Krok 3: Utwórz aplikację Vite/React/TypeScript, typowany klient API i kontroler czasu.**
- [ ] **Krok 4: Uruchom ponownie test oraz `npm run build`.**
Oczekiwane: test PASS i build kończy się kodem 0.

### Zadanie 13: Główny układ i dashboard

**Pliki:**
- Utwórz: `frontend/src/components/AppShell.tsx`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/TopBar.tsx`
- Utwórz: `frontend/src/pages/DashboardPage.tsx`
- Test: `frontend/src/pages/DashboardPage.test.tsx`

**Interfejs:** `AppShell` udostępnia nawigację do sześciu widoków i umieszcza kontroler czasu w `TopBar`; `DashboardPage` prezentuje KPI dla dzierżaw aktywnych, ostrzeżeń, wygasłych i rekomendacji down-scope.

- [ ] **Krok 1: Napisz `test_dashboard_displays_lease_kpis_and_navigation`** z odpowiedzią API zawierającą co najmniej po jednej dzierżawie każdego statusu.
- [ ] **Krok 2: Uruchom:** `cd frontend && npm test -- --run src/pages/DashboardPage.test.tsx`
Oczekiwane: FAIL, strona lub oczekiwane elementy UI nie istnieją.
- [ ] **Krok 3: Zaimplementuj układ SPA, nawigację i karty KPI.**
- [ ] **Krok 4: Uruchom ponownie test i `npm run build`.**
Oczekiwane: test PASS, build kończy się kodem 0.

### Zadanie 14: Inwentarz dzierżaw

**Pliki:**
- Utwórz: `frontend/src/pages/LeasesPage.tsx`
- Utwórz: `frontend/src/components/LeaseTable.tsx`
- Test: `frontend/src/pages/LeasesPage.test.tsx`

**Interfejs:** `LeaseTable` pokazuje użytkownika, zespół, repozytorium, rolę, ostatnią aktywność, pozostałe dni i status; akcje wiersza wywołują przedłużenie, down-scope lub odebranie.

- [ ] **Krok 1: Napisz `test_lease_inventory_renders_status_and_actions`** asercjami dla kolumn i wywołań wszystkich trzech akcji.
- [ ] **Krok 2: Uruchom:** `cd frontend && npm test -- --run src/pages/LeasesPage.test.tsx`
Oczekiwane: FAIL, komponent inwentarza nie istnieje.
- [ ] **Krok 3: Dodaj tabelę oraz podłącz akcje do klienta API.**
- [ ] **Krok 4: Uruchom ponownie test i `npm run build`.**
Oczekiwane: test PASS, build kończy się kodem 0.

### Zadanie 15: Ostrzeżenia i centrum odwołań

**Pliki:**
- Utwórz: `frontend/src/pages/AppealsPage.tsx`
- Utwórz: `frontend/src/components/AppealForm.tsx`, `frontend/src/components/AppealDecisionModal.tsx`
- Test: `frontend/src/pages/AppealsPage.test.tsx`

**Interfejs:** formularz wymaga uzasadnienia; widok pokazuje status ostrzeżenia, historię odwołań i statystyki użycia; modal administratora oferuje przedłużenie 7/30/90 dni lub custom, revoke i down-scope.

- [ ] **Krok 1: Napisz `test_appeal_submission_requires_justification_and_admin_can_resolve`** sprawdzający walidację uzasadnienia i wywołanie wybranej decyzji.
- [ ] **Krok 2: Uruchom:** `cd frontend && npm test -- --run src/pages/AppealsPage.test.tsx`
Oczekiwane: FAIL, widok i formularz nie istnieją.
- [ ] **Krok 3: Zaimplementuj formularz, historię odwołań i modal decyzji.**
- [ ] **Krok 4: Uruchom ponownie test i `npm run build`.**
Oczekiwane: test PASS, build kończy się kodem 0.

### Zadanie 16: Widok baseline i onboarding

**Pliki:**
- Utwórz: `frontend/src/pages/BaselinePage.tsx`
- Utwórz: `frontend/src/components/BaselineApproval.tsx`
- Test: `frontend/src/pages/BaselinePage.test.tsx`

**Interfejs:** widok rozdziela standard DEV i QA, prezentuje repozytoria oraz proponowane role i pozwala administratorowi zatwierdzić standard nowego developera.

- [ ] **Krok 1: Napisz `test_baseline_displays_team_recommendations_and_approval`** sprawdzający repozytoria obu zespołów i wysłanie zatwierdzenia.
- [ ] **Krok 2: Uruchom:** `cd frontend && npm test -- --run src/pages/BaselinePage.test.tsx`
Oczekiwane: FAIL, widok baseline nie istnieje.
- [ ] **Krok 3: Dodaj widok rekomendacji oraz akcję zatwierdzenia onboardingowego.**
- [ ] **Krok 4: Uruchom ponownie test i `npm run build`.**
Oczekiwane: test PASS, build kończy się kodem 0.

### Zadanie 17: Graf uprawnień

**Pliki:**
- Utwórz: `frontend/src/pages/PermissionsGraphPage.tsx`
- Utwórz: `frontend/src/components/PermissionsGraph.tsx`
- Test: `frontend/src/pages/PermissionsGraphPage.test.tsx`

**Interfejs:** graf `@xyflow/react` prezentuje węzły użytkowników → zespołów → repozytoriów, status dzierżaw oraz filtry zespołu i repozytorium podwyższonego ryzyka.

- [ ] **Krok 1: Napisz `test_permissions_graph_renders_relationships_and_filters`** sprawdzający relacje węzłów i wynik filtrowania.
- [ ] **Krok 2: Uruchom:** `cd frontend && npm test -- --run src/pages/PermissionsGraphPage.test.tsx`
Oczekiwane: FAIL, widok grafu nie istnieje.
- [ ] **Krok 3: Zaimplementuj graf i filtry, korzystając z danych API.**
- [ ] **Krok 4: Uruchom ponownie test i `npm run build`.**
Oczekiwane: test PASS, build kończy się kodem 0.

### Zadanie 18: Dziennik audytowy

**Pliki:**
- Utwórz: `frontend/src/pages/AuditLogPage.tsx`
- Utwórz: `frontend/src/components/AuditLogTable.tsx`
- Test: `frontend/src/pages/AuditLogPage.test.tsx`

**Interfejs:** dziennik pokazuje czas, aktora, akcję, cel i uzasadnienie, z filtrem zdarzeń ludzkich i automatycznych.

- [ ] **Krok 1: Napisz `test_audit_log_displays_events_and_filters_actor_type`.**
- [ ] **Krok 2: Uruchom:** `cd frontend && npm test -- --run src/pages/AuditLogPage.test.tsx`
Oczekiwane: FAIL, widok dziennika nie istnieje.
- [ ] **Krok 3: Zaimplementuj tabelę zdarzeń i filtr rodzaju aktora.**
- [ ] **Krok 4: Uruchom ponownie test i `npm run build`.**
Oczekiwane: test PASS, build kończy się kodem 0.

## Faza 4: Integracja i weryfikacja demo

### Zadanie 19: Testy integracyjne scenariuszy demonstracyjnych

**Pliki:**
- Utwórz: `backend/tests/integration/test_demo_scenarios.py`
- Utwórz: `frontend/src/App.integration.test.tsx`

**Interfejs:** testy integracyjne pokrywają scenariusze A–D, cykl aktywny → warning → expired, odwołanie, down-scope oraz Last Admin Protection.

- [ ] **Krok 1: Napisz testy integracyjne** dla: stanu początkowego, skoku czasu o 25 dni, odwołania i down-scope admin→push, skoku o kolejne 35 dni oraz próby usunięcia ostatniego admina.
- [ ] **Krok 2: Uruchom osobno z katalogu głównego repozytorium:** `cd backend && pytest tests/integration/test_demo_scenarios.py -q`, a następnie `cd frontend && npm test -- --run src/App.integration.test.tsx`.
Oczekiwane: testy FAIL na niezaimplementowanym lub niepodłączonym zachowaniu.
- [ ] **Krok 3: Napraw wyłącznie błędy integracji między ukończonymi zadaniami, nie duplikując logiki domenowej w routerach ani komponentach.**
- [ ] **Krok 4: Uruchom osobno z katalogu głównego repozytorium:** `cd backend && pytest -q`, a następnie `cd frontend && npm test -- --run && npm run build`.
Oczekiwane: wszystkie testy PASS, build kończy się kodem 0, a ręczny przebieg demo odpowiada krokom z testu.
