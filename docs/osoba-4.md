# Osoba 4 (Durczkos) — standard zespołu, onboarding, odwołania, audyt, dane dla widoków

> **Stan na: 2026-10-03.** Testy backendu: `256 passed` (cały `main` z mockiem Osoby 2 + moje kroki + poprawki po audycie). Kontrakt TS aktualny.
> Kontrakty: [ADR 0011](adr/0011-person-4-baseline-appeals-audit-insights.md) · Plany: [`superpowers/plans/2026-10-03-p4-*.md`](superpowers/plans/2026-10-03-p4-overview.md)

## 1. Stan kroków

| Krok | Co | Stan | Gałąź |
| --- | --- | --- | --- |
| 4.5 | Audyt tylko do dopisywania + `GET /api/v1/audit` z filtrami + wspólna infrastruktura API v1 | ✅ | `feat/4-5-audit-log` |
| 4.1 | Standard zespołu (50% aktywnych, najniższy poziom, bez admina) | ✅ | `feat/4-1-team-baseline` |
| 4.2 | Onboarding: propozycja dla nowej osoby + zatwierdzenie | ✅ | `feat/4-2-onboarding` |
| 4.3 | Odwołania: złożenie (puste i powtórzone uzasadnienie → 422), odrzucenie | ✅ | `feat/4-3-appeals` |
| 4.3C | Rozpatrzenie odwołania decyzją (przedłuż / zdeeskaluj / odbierz) | ⏳ czeka na Osobę 3 (3.6) | — |
| 4.4 | Historia odwołań osoby | ✅ | `feat/4-4-appeal-history` |
| 4.6A | Liczniki dashboardu, układ grafu, typy dla frontu | ✅ | `feat/4-6-insights-core` |
| 4.6B | Endpointy `GET /dashboard/stats`, `GET /graph` | ⏳ czeka na Osobę 3 (3.6) — **linia cięcia demo** | — |
| + | Zegar symulacji: który dzień demo | ✅ | `feat/simulation-clock` |
| + | Poprawki po audycie kodu (wyścig odwołań, odebrany dostęp, ochrona admina w adapterze) | ✅ | `fix/p4-review` |
| + | Dopasowanie do mocka Osoby 2: tylko akcje odnawiające, zegar w jej routerze, ADR 0010 → 0011 | ✅ | `fix/p4-align-github-mock` |

Gałęzie tworzą stos: każda wyrasta z poprzedniej, w kolejności z tabeli. PR-y scalamy w tej samej kolejności, a po scaleniu jednego następny ma już czysty diff.

## 2. Endpointy, które działają

| Endpoint | Przykład odpowiedzi / zachowanie |
| --- | --- |
| `GET /api/v1/simulation/clock` | `{"simulated_now": "2026-10-18T15:24:00Z", "offset_days": 15}` |
| `GET /api/v1/teams/dev/baseline` | `BaselineEntry[]`; na seedzie: `auth-service` write (7/12), `core-api` write (11/12), `payment-service` read (8/12) |
| `GET /api/v1/onboarding/nowy-dev` | `OnboardingProposal {user, team, to_grant, already_granted}` |
| `POST /api/v1/onboarding/nowy-dev/apply` | nadaje brakujące dostępy, zwraca propozycję po nadaniu (`to_grant: []`); drugie kliknięcie nic nie dubluje |
| `POST /api/v1/appeals` `{"lease_id", "justification"}` | 201 `AppealOverview`; 422 puste/powtórzone uzasadnienie; 409 dostęp nie wygasa w ciągu 7 dni albo odwołanie już czeka; 404 |
| `POST /api/v1/appeals/{id}/reject` `{"justification"}` | `AppealOverview` ze statusem `REJECTED`; 409 jeśli już rozpatrzone |
| `GET /api/v1/appeals?login=marta` | historia odwołań osoby (najnowsze pierwsze), z `days_remaining`, `recent_activity_count`, `previous_appeals` |
| `GET /api/v1/appeals?lease_id=5&status=PENDING` | czy dzierżawa ma oczekujące odwołanie (dla modala decyzji) |
| `GET /api/v1/audit?actor_type=&action=&actor_login=&target=&since=&until=&limit=` | `AuditEntry[]` z gotowym `actor_login`, najnowsze pierwsze |

Wszystkie typy są w `frontend/src/types/api.ts`: `SimulationClock`, `OnboardingProposal`, `AppealOverview`, `AppealRejectRequest`, `AuditEntry`, `DashboardStats`, `PermissionGraph`.

## 3. Najważniejsze decyzje (pełna treść: ADR 0011)

1. **Wpisów audytu nie da się zmienić ani usunąć.** Pilnuje tego baza (wyzwalacze w migracji `0002`), także przy surowym SQL. Reset demo dalej działa.
2. **Wpisy do audytu tylko przez `write_audit_event`**, a opis celu dzierżawy przez `lease_target`.
3. **Dostęp nadajemy tylko przez port `VCSProvider`.** Mock Osoby 2 jest w `main`, ale jeszcze nie implementuje portu, więc działa tymczasowy adapter (dzierżawa = kolaborator).
4. **Odwołanie przysługuje**, gdy dostęp odebrano albo wygasa w ciągu 7 dni (także już wygasł). Każde odwołanie wymaga **nowego** uzasadnienia: wielkość liter i spacje się nie liczą. Na jedną dzierżawę może czekać tylko jedno odwołanie; pilnuje tego też baza (migracja `0003`), więc podwójne kliknięcie daje 409.
5. **Status odwołania:** przedłużenie → `APPROVED`; deeskalacja, odebranie albo odrzucenie → `REJECTED`.
6. **Liczba 7 dni i „ile dni zostało”** są w jednym miejscu: `app/domain/lease_window.py`. Osoba 3 korzysta z tego samego.
7. **Aktor „admin”** to konto z `Settings.admin_login` (domyślnie `tomasz-admin`), bo MVP nie ma logowania.
8. **Jako dowód użycia liczą się tylko akcje odnawiające** (push, review, komentarz — `RENEWING_ACTIONS` z ADR 0010 Osoby 2); merge, label i zmiana ustawień z mocka nie.

## 4. Na co czekam

| Od kogo | Czego | Czy mnie blokuje |
| --- | --- | --- |
| Osoba 3 | `list_lease_overviews(session, now) -> list[LeaseOverview]` w `app/services/lease_service.py` | **Tak:** dashboard i graf (4.6B), czyli linia cięcia demo |
| Osoba 3 | `apply_lease_decision(session, vcs, *, lease, decision, now, actor_id) -> Lease` w `app/services/decision_service.py` | **Tak:** rozpatrzenie odwołania decyzją (4.3C) |
| Osoba 2 | adapter `VCSProvider` na bazie jej `GitHubCollaboratorService` + podmiana `get_vcs_provider`; audyt `TIME_TRAVEL` | Nie: mam adapter tymczasowy |

Gotowy kod i testy 4.3C i 4.6B są w planach (sprawdzone na zaślepkach: `169 passed`). Po 3.6 to około godziny pracy.

## 5. Wiadomości dla zespołu (do wklejenia)

**Do Osoby 3 (Guziol)**

Cześć! Potrzebuję od Ciebie dwóch funkcji. Bez nich nie zrobię dashboardu, który jest na linii cięcia demo.

1. W pliku `backend/app/services/lease_service.py` funkcja `async def list_lease_overviews(session, now) -> list[LeaseOverview]`. Ma zwracać wszystkie dzierżawy jako `LeaseOverview` (ten schemat już jest w `main`), czyli ze statusem, liczbą dni i rekomendacją.
2. W pliku `backend/app/services/decision_service.py` funkcja `async def apply_lease_decision(session, vcs, *, lease, decision: DecisionRequest, now, actor_id) -> Lease`. Ma wykonać decyzję admina na dzierżawie.

Gotowe rzeczy, z których możesz od razu korzystać:
- **Liczba 7 dni i liczenie „ile dni zostało”** są w `app/domain/lease_window.py`. Weź je stamtąd, nie pisz drugi raz.
- **Audyt zapisujesz tylko przez `write_audit_event`** (`app/services/audit_service.py`). Typ akcji bierzesz z `AuditAction` (np. `LEASE_EXTENDED`, `LEASE_REVOKED`), a cel opisujesz przez `lease_target(owner, repo, login)`. Nie twórz ręcznie `AuditLog`, bo baza i tak zablokuje każdą zmianę wpisu.
- **Admin** to `actor_id` z zależności `AdminIdDep`, a **system** (tryb auto) to `actor_id=None`.
- **Swój router dopisujesz jedną linią** w `app/api/v1/router.py`.

Dwie rzeczy do decyzji po Twojej stronie:
- Nowa osoba dostaje dostęp i jeszcze nic nie zrobiła. Obecne reguły dadzą jej od razu „odbierz”. Proponuję wtedy zwracać `KEEP`.
- W `LeaseStatus` nie ma statusu dla admina ani dla odebranego dostępu. Wybierz, co tam wpisujesz; moje liczniki i tak to ignorują.

Szkic reguł: `docs/superpowers/specs/archive/2026-10-03-draft-lease-rules-for-person-3.md`.

**Do Osoby 2 (Dawid)**

Cześć! Twój mock jest już w `main`, super. Z mojej strony zostały dwie małe rzeczy:

1. **Podepnij mock pod mój onboarding.** W `app/ports/vcs_provider.py` jest port z jedną metodą: `async def set_permission(owner, repo, username, role: Role) -> None`. Zrób mały adapter, który woła Twój `GitHubCollaboratorService` (rola domenowa → `to_github(role)`), a potem w `app/api/v1/deps.py` podmień **jedną funkcję**, `get_vcs_provider`, żeby zwracała Twój adapter zamiast mojego tymczasowego `DatabaseVCSAdapter`. Uwaga: Twój serwis robi `commit` w środku, a mój onboarding zapisuje audyt w tej samej transakcji. Nic się nie zepsuje, ale fajnie by było, gdyby adapter tylko robił `flush`.
2. **Zapisuj time-travel w audycie:** `write_audit_event(..., action=AuditAction.TIME_TRAVEL, ...)` z `app/services/audit_service.py`.

Dopisałem do Twojego routera `app/api/v1/simulation.py` jeden endpoint: `GET /api/v1/simulation/clock` → `{"simulated_now", "offset_days"}` (który dzień demo pokazać w panelu). Twoje `GET/POST/DELETE /time-travel` są nietknięte. Mój standard zespołu i licznik aktywności w odwołaniach filtrują Twoje `RENEWING_ACTIONS`, czyli merge'e, labele i zmiany ustawień się nie liczą (Twój ADR 0010).

**Do Osoby 1 (Kocik)**

Cześć, tylko informacyjnie. Dopisałem kilka drobiazgów w Twoich plikach:
- `AuditAction` w `enums.py`;
- `admin_login` w `Settings`;
- nowe schematy w `schemas/` i ich rejestracja w kontrakcie;
- rejestracja routera v1 w `main.py`;
- migracja `0002`, która blokuje zmienianie i usuwanie wpisów audytu.

Reset demo działa jak wcześniej, sprawdziłem. Jeśli kiedyś zrobisz migrację, która przebudowuje tabelę `audit_logs`, trzeba w niej ponownie założyć tę blokadę. Test to wykryje.

**Do Osoby 5 (Kubuś)**

Endpointy, które już działają, są w tabeli w sekcji 2. Najważniejsze dla Ciebie:
- **który dzień demo pokazać w pasku:** `GET /api/v1/simulation/clock`;
- **historia odwołań w modalu:** `GET /api/v1/appeals?login=...`;
- **czy dzierżawa ma oczekujące odwołanie:** `GET /api/v1/appeals?lease_id=...&status=PENDING`.

Jeśli odwołanie czeka, decyzję wysyłasz na `/appeals/{id}/decision` (dojdzie po Osobie 3), a nie na endpoint dzierżawy.

Wkrótce dojdą `GET /api/v1/dashboard/stats` (gotowe liczby do kart) i `GET /api/v1/graph` (gotowe `nodes` i `edges` do `<ReactFlow>`). Typy masz w `frontend/src/types/api.ts`.

**Do Osoby 6 (Sydor)**

W `frontend/src/types/api.ts` są typy do fixture'ów: `SimulationClock`, `AuditEntry`, `OnboardingProposal`, `AppealOverview`, `DashboardStats`, `PermissionGraph`. Dokładny format grafu pokazuje test `backend/tests/schemas/test_insights_schemas.py`.

## 6. Pliki Osoby 4

```
backend/app/domain/      baseline_rules.py, appeal_rules.py, lease_window.py, insights.py
backend/app/services/    errors.py, audit_service.py, baseline_service.py, appeal_service.py
backend/app/ports/       vcs_provider.py
backend/app/adapters/    database_vcs.py              (tymczasowy, do podmiany przez Osobę 2)
backend/app/api/v1/      deps.py, errors.py, router.py, audit.py, baseline.py, onboarding.py, appeals.py (+ GET /clock w simulation.py Osoby 2)
backend/app/schemas/     insights.py + dopiski w audit.py, baseline.py, appeal.py, simulation.py, __init__.py
backend/alembic/versions/0002_audit_logs_append_only.py, 0003_one_pending_appeal_per_lease.py
backend/tests/           factories.py, fakes.py + testy domain/ services/ api/ adapters/ db/ schemas/
```

## 7. Jak sprawdzić

```bash
cd backend
uv run pytest                                    # albo .venv/bin/python -m pytest
uv run uvicorn app.main:app --reload
curl -s localhost:8000/api/v1/simulation/clock
curl -s localhost:8000/api/v1/teams/dev/baseline
curl -s localhost:8000/api/v1/onboarding/nowy-dev
curl -s 'localhost:8000/api/v1/audit?limit=5'
```
