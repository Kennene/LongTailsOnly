# Osoba 4 (Durczkos) — standard zespołu, onboarding, odwołania, audyt, dane dla widoków

> **Stan na: 2026-10-03, wieczór.** Wszystkie kroki 4.1–4.6 zrobione. Testy backendu: `412 passed` (cały `main` + moje zmiany). Kontrakt TS aktualny.
> Kontrakty: [ADR 0014](adr/0014-person-4-baseline-appeals-audit-insights.md) · Plany: [`superpowers/plans/2026-10-03-p4-*.md`](superpowers/plans/2026-10-03-p4-overview.md)

## 1. Stan kroków

| Krok | Co | Stan |
| --- | --- | --- |
| 4.5 | Audyt tylko do dopisywania + `GET /api/v1/audit` z filtrami + wspólna infrastruktura API v1 | ✅ |
| 4.1 | Standard zespołu (50% aktywnych, najniższy poziom, bez admina) | ✅ |
| 4.2 | Onboarding: propozycja dla nowej osoby + zatwierdzenie | ✅ |
| 4.3 | Odwołania: złożenie (puste i powtórzone uzasadnienie → 422), odrzucenie, decyzja (przedłuż / zdeeskaluj / odbierz) | ✅ |
| 4.4 | Historia odwołań osoby | ✅ |
| 4.6 | Dashboard (`GET /dashboard/stats`) i graf React Flow (`GET /graph`) na silniku Osoby 3 | ✅ |
| + | Zegar symulacji: który dzień demo | ✅ |
| + | Poprawki po audycie kodu, dopasowanie do mocka Osoby 2, porządek numeracji ADR (0014) | ✅ |

Cała praca Osoby 4 jest na gałęzi `feat/osoba-4` (pierwsza część scalona w PR #8).

## 2. Endpointy, które działają

| Endpoint | Przykład odpowiedzi / zachowanie |
| --- | --- |
| `GET /api/v1/simulation/clock` | `{"simulated_now": "2026-10-18T15:24:00Z", "offset_days": 15}` |
| `GET /api/v1/teams/dev/baseline` | `BaselineEntry[]`; na seedzie: `auth-service` write (7/12), `core-api` write (11/12), `payment-service` read (8/12) |
| `GET /api/v1/teams/dev/onboarding-candidates` | `UserRead[]` — kto w zespole czeka na standard (bez aktywnego dostępu); na seedzie: `nowy-dev` |
| `GET /api/v1/onboarding/nowy-dev` | `OnboardingProposal {user, team, to_grant, already_granted}` |
| `POST /api/v1/onboarding/nowy-dev/apply` | nadaje brakujące dostępy, zwraca propozycję po nadaniu (`to_grant: []`); drugie kliknięcie nic nie dubluje |
| `POST /api/v1/appeals` `{"lease_id", "justification"}` | 201 `AppealOverview`; 422 puste/powtórzone uzasadnienie; 409 dostęp nie wygasa w ciągu 7 dni albo odwołanie już czeka; 404 |
| `POST /api/v1/appeals/{id}/reject` `{"justification"}` | `AppealOverview` ze statusem `REJECTED`; 409 jeśli już rozpatrzone |
| `GET /api/v1/appeals?login=marta` | historia odwołań osoby (najnowsze pierwsze), z `days_remaining`, `recent_activity_count`, `previous_appeals` |
| `GET /api/v1/appeals?lease_id=5&status=PENDING` | czy dostęp ma oczekujące odwołanie (dla modala decyzji) |
| `GET /api/v1/audit?actor_type=&action=&actor_login=&target=&since=&until=&limit=` | `AuditEntry[]` z gotowym `actor_login`, najnowsze pierwsze |
| `POST /api/v1/appeals/{id}/decision` (body jak `DecisionRequest`) | wykonuje decyzję silnikiem Osoby 3 i zamyka odwołanie: `EXTEND` → `APPROVED`, `DOWNSCOPE`/`REVOKE` → `REJECTED`; 409 już rozpatrzone; 403 ostatni admin |
| `GET /api/v1/dashboard/stats` | `{"generated_at", "active", "warning", "expired", "expired_window_days", "permanent", "revoked", "downscope_recommendations", "revoke_recommendations", "pending_appeals", "onboarding_candidates"}`; `expired` liczy tylko wygaśnięcia z ostatnich `expired_window_days` (30) dni |
| `GET /api/v1/graph?team=dev` | `{"nodes", "edges"}` gotowe do `<ReactFlow>` (pozycje policzone, status w `edge.data.status`) |

Wszystkie typy są w `frontend/src/types/api.ts`: `SimulationClock`, `OnboardingProposal`, `AppealOverview`, `AppealRejectRequest`, `AuditEntry`, `DashboardStats`, `PermissionGraph`.

## 3. Najważniejsze decyzje (pełna treść: ADR 0014)

1. **Wpisów audytu nie da się zmienić ani usunąć.** Pilnuje tego baza (wyzwalacze w migracji `0002`), także przy surowym SQL. Reset demo dalej działa.
2. **Wpisy do audytu tylko przez `write_audit_event`**, a opis celu dostępu przez `lease_target`.
3. **Dostęp nadajemy tylko przez port `VCSProvider`.** Mock Osoby 2 jest w `main`, ale jeszcze nie implementuje portu, więc działa tymczasowy adapter (dostęp = kolaborator).
4. **Odwołanie przysługuje**, gdy dostęp odebrano albo wygasa w ciągu 7 dni (także już wygasł). Każde odwołanie wymaga **nowego** uzasadnienia: wielkość liter i spacje się nie liczą. Na jeden dostęp może czekać tylko jedno odwołanie; pilnuje tego też baza (migracja `0003`), więc podwójne kliknięcie daje 409.
5. **Status odwołania:** przedłużenie → `APPROVED`; deeskalacja, odebranie albo odrzucenie → `REJECTED`.
6. **Liczba 7 dni i „ile dni zostało”** są w jednym miejscu: `app/domain/lease_window.py`. Osoba 3 korzysta z tego samego. Tam też mieszka okno licznika „Wygaśnięte” (`EXPIRED_WINDOW_DAYS = 30`, `lapsed_within_window`).
7. **Aktor „admin”** to konto z `Settings.admin_login` (domyślnie `tomasz-admin`), bo MVP nie ma logowania.
8. **Jako dowód użycia liczą się tylko akcje odnawiające** (push, review, komentarz — `RENEWING_ACTIONS` z ADR 0010 Osoby 2); merge, label i zmiana ustawień z mocka nie.

## 4. Na co czekam

Na nic, co by mnie blokowało. Osoba 3 dostarczyła `list_lease_overviews` i `apply_lease_decision` (PR #11), więc 4.3C i 4.6B są zrobione.

| Od kogo | Czego | Czy mnie blokuje |
| --- | --- | --- |
| Osoba 2 | adapter `VCSProvider` na bazie jej `GitHubCollaboratorService` + podmiana `get_vcs_provider`; audyt `TIME_TRAVEL` | Nie: działa adapter tymczasowy |

## 5. Wiadomości dla zespołu (do wklejenia)

**Do Osoby 3 (Guziol)**

Dzięki! Twoje `list_lease_overviews` i `apply_lease_decision` są już podpięte: dashboard, graf i `POST /api/v1/appeals/{id}/decision` działają na Twoim silniku. Twój 409 na `/leases/{id}/decision` przy oczekującym odwołaniu współpracuje z moim endpointem (jest na to test). Niczego więcej od Ciebie nie potrzebuję.

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
- **czy dostęp ma oczekujące odwołanie:** `GET /api/v1/appeals?lease_id=...&status=PENDING`.

Jeśli odwołanie czeka, decyzję wysyłasz na `POST /api/v1/appeals/{id}/decision` (to samo body co dla dostępu), a nie na endpoint dostępu, bo ten zwróci 409.

Działają też `GET /api/v1/dashboard/stats` (gotowe liczby do kart) i `GET /api/v1/graph?team=dev` (gotowe `nodes` i `edges` do `<ReactFlow>`, bez liczenia pozycji). Typy masz w `frontend/src/types/api.ts`.

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
