# Zadanie: Okno czasowe licznika „Wygaśnięte” na Pulpicie — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:executing-plans` (praca w tej sesji) albo `superpowers:tdd` przy każdym kroku. Kroki używają checkboxów (`- [ ]`).

**Cel:** Licznik `expired` na Pulpicie przestaje rosnąć od początku istnienia systemu. Pokazuje wyłącznie dostępy, które wygasły **w ostatnich 30 dniach** (nowa stała `EXPIRED_WINDOW_DAYS`), a stare wygaśnięcia zostają historią widoczną w tabeli „Dostępy”.

**Powód (od użytkownika):** „Na pulpicie bez sensu żeby liczyło wygaśnięte od początku istnienia programu, niech pokazuje tylko wygasłe w ostatnie 30 albo 7 dni.” Wybrane 30 dni: domyślna długość dostępu (`PRODUKT.md`), a okno 7 dni pokrywałoby się z oknem ostrzegawczym i przy danych demo (wygaśnięcia 9–12 dni po terminie) byłoby prawie zawsze zerowe.

**Zakres rozszerzony świadomie:** seed demo ma **wszystkie** wygasłe dostępy dokładnie 60 dni po terminie (`LEASE_GRANTED_DAYS_AGO = 90`, brak zdarzeń), więc okno 30 dni dałoby zero na starcie. Rozrzucamy daty wygaśnięcia w seedzie, żeby licznik był niezerowy i żeby było widać filtrowanie.

**Architektura:** Reguła zostaje w jednym miejscu — czysta funkcja `app/domain/insights.py::compute_dashboard_counters`. Frontend nadal nic nie liczy: nowe pole kontraktu `expired_window_days` opisuje okno, więc tekst na karcie nie ma zaszytego „30”.

**Stack:** Python 3.14, FastAPI + Pydantic, SQLAlchemy async, pytest + anyio. Frontend: React 19 + Vite 8 + Vitest + MSW.

**Spec:** ADR 0002 (okno ostrzegawcze), ADR 0009 (kontrakt Pydantic → TS), ADR 0011 (fixtures zgodne z kontraktem), ADR 0014 §5.9 (liczniki pulpitu), ADR 0008 (zegar wstrzykiwany — seed deterministyczny).

**Branch:** `feat/dashboard-expired-window` · **Obszary:** backend (Osoba 4 + Osoba 1 seed) i frontend (Osoba 5)

## Ograniczenia globalne

- Jedno źródło prawdy dla okna: `EXPIRED_WINDOW_DAYS` w `backend/app/domain/lease_window.py`. Backend, fixtures i MSW muszą liczyć tę samą regułę.
- Zero zmian w `status`, `days_remaining`, tabeli „Dostępy” i grafie — wygasłe dostępy zostają tam widoczne.
- Determinizm seeda bez zmian: daty wynikają wyłącznie z wstrzykniętego zegara (`ADR 0008`, `ADR 0012`).
- Po zmianie `app/models/` albo `app/schemas/` regenerujemy kontrakt i typy (ADR 0009); fixtures waliduje `pytest tests/contract`.
- Kod i dokumentacja spójne: ADR 0014 §5.9, `docs/osoba-4.md`, `shared/fixtures/README.md`.

## Semantyka

`expired` = dostępy aktywne, nie-admin, o statusie `EXPIRED` (czyli `expires_at <= now`) **i** `expires_at > now - 30 dni`.
Dostępy wygasłe dawniej niż 30 dni nie znikają z systemu — są w `GET /api/v1/leases`, w audycie i na grafie; licznik pulpitu jest alarmem „co wygasło ostatnio”.

## Kroki

### Część A — metryka (TDD)

- [ ] **A1 (RED):** `tests/domain/test_insights_stats.py` — wygasła 3 dni temu liczy się do `expired`, wygasła 40 dni temu nie; przypadek brzegowy: dokładnie 30 dni temu włącznie liczy się, 30 dni i 1 s wcześniej nie.
- [ ] **A2 (GREEN):** `EXPIRED_WINDOW_DAYS = 30` w `lease_window.py`; `LeaseSnapshot` dostaje `expires_at`; `compute_dashboard_counters(..., *, now)` filtruje `expired`.
- [ ] **A3:** `insights_service` przekazuje `expires_at` i `now`; testy serwisu i API dalej zielone (ich wygasły dostęp jest 15 dni po terminie).
- [ ] **A4:** `DashboardStats.expired_window_days` + test serializacji; regeneracja `contract/schema.json` i `frontend/src/types/api.ts`.

### Część B — dane demo (TDD)

- [ ] **B1 (RED):** `tests/db/test_seed.py` — w zaseedowanej bazie są wygasłe dostępy **zarówno** w oknie 30 dni, jak i poza nim (inaczej licznik nie pokazuje, że filtruje).
- [ ] **B2 (GREEN):** `LeaseSpec.granted_days_ago` + `seed._granted_at(spec, anchor)`; w `_kamil()` jawne daty wygaśnięcia: `frontend-app` 2 dni, `notifications` 6, `infra-terraform` 11, `mobile-app` 17, `data-pipeline` 23, `qa-automation` 34, `legacy-reports` 47 dni po terminie.
- [ ] **B3:** regeneracja `shared/fixtures/leases-expired.json` (daty, `days_remaining`) i `shared/fixtures/audit.json` (`LEASE_EXPIRED` dla `kamil@legacy-reports`) z realnie zaseedowanej bazy; `pytest tests/contract`.

### Część C — frontend

- [ ] **C1 (RED):** testy `api/dashboard.test.ts` i `pages/DashboardPage.test.tsx` — `expired` liczony w oknie, karta pokazuje tekst z `expired_window_days`.
- [ ] **C2 (GREEN):** `countDashboard` mirror reguły (okno liczone z `generatedAt`) + `expired_window_days`; hint karty „Wygasłe w ostatnich 30 dniach”; MSW płynie z zegarem symulowanym.

### Część D — dokumentacja i weryfikacja

- [ ] **D1:** ADR 0014 §5.9 pkt 9 + lista pól, `docs/osoba-4.md`, `shared/fixtures/README.md` (przykład `days_remaining`).
- [ ] **D2:** `pytest` (backend, całość), `npm run test:run`, `npm run typecheck`, `npm run lint`, `npm run format:check` (frontend) + podgląd na żywo na `http://localhost:5173`.

## Kryteria akceptacji

1. Pulpit na dniu 0 pokazuje `expired = 5` (dostępy Kamila wygasłe 2–23 dni temu), a 9 starszych wygaśnięć nie wchodzi do licznika.
2. Podróż w czasie zmienia licznik zgodnie z oknem (`+15 dni` → 3 nowe wygaśnięcia z seeda wchodzą do okna).
3. `status` i `days_remaining` dostępów nie zmieniają znaczenia; „Dostępy” pokazują wszystkie wygasłe.
4. Wszystkie testy backendu i frontendu zielone; kontrakt i fixtures spójne (`pytest tests/contract`).
