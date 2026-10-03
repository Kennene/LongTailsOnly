# Specyfikacja: Frontend SPA — GitHub Access Lease Governor

**Data:** 2026-10-03 (rewizja po PR #5 — kontrakt z kroku 1.2 już istnieje)
**Autor:** Osoba 5 (KUBUŚ) — cały frontend (`frontend/`)
**Status:** do przeglądu przed planem implementacji
**Powiązane dokumenty:** `PRODUKT.md`, `PLAN.md`, `GLOSSARY.md`, `CODING_STANDARDS.md`, ADR 0001–0010, `docs/superpowers/plans/2026-10-03-frontend-spa.md`

---

## 1. Cel i zakres

Zbudować cały frontend jako SPA — konsolę administratora bezpieczeństwa IT (Security Admin Panel) do zarządzania odnawialnymi dzierżawami dostępów GitHuba. Zakres odpowiada krokom **5.1–5.10** z podziału pracy zespołu.

**Linia cięcia po 5.6.** Do tego miejsca działa UC-2 (deeskalacja), UC-4 (sterowanie czasem) i UC-5 (ochrona ostatniego administratora) — minimalne demo. Kroki 5.7–5.10 (onboarding UC-1, odwołania UC-3, graf, audyt) są bonusem realizowanym po osiągnięciu linii cięcia.

**W zakresie:** 10 PR-ów z tabeli podziału pracy, `AppShell` z nawigacją, pasek czasu (Time Travel), tabela dzierżaw, modal decyzji, dashboard z licznikami, widok baseline z onboardingiem, formularz i historia odwołań, graf `@xyflow/react`, dziennik audytu, warstwa API, testy jednostkowe/komponentowe/integracyjne.

**Poza zakresem (YAGNI):** i18n, przełącznik motywów (ciemny domyślnie), logowanie i role w UI (jedna konsola admina, symulująca także stronę użytkownika składającego odwołanie), generowanie klienta z OpenAPI, Storybook, testy e2e w przeglądarce, biblioteka wykresów, moduł wyjaśnień LLM (M8), MSW w przeglądarce (tylko testy).

---

## 2. Zależności międzyzespołowe i punkty synchronizacji

| Krok | Dostarcza | Stan na 2026-10-03 |
| --- | --- | --- |
| 1.2 | Schematy Pydantic + kontrakt TS | **zrobione** — `backend/contract/schema.json` → `frontend/src/types/api.ts` (ADR 0009) |
| 1.4–1.6 | TimeProvider, seed, reset demo | **zrobione** — `/health`, `POST /api/v1/demo/reset` |
| 2.5 | `POST /api/v1/simulation/time-travel` + odczyt zegara | brak |
| 3.6 | lista dzierżaw z policzonym statusem + decyzje | brak |
| 4.2 | onboarding / baseline (zapis) | brak |
| 4.3–4.5 | odwołania, historia odwołań, audyt | brak |
| 4.6 | liczniki dashboardu + dane grafu | brak |
| 6.1 | fixture'y JSON dla frontu | brak — frontend tworzy własne, w kształcie kontraktu |

**Punkty synchronizacji zespołu:**

- **Po 1.2 i 6.1:** kontrakt przyjęty, frontend pracuje na fixture'ach (5.1–5.3). Kontrakt już jest, więc 5.1–5.3 startują natychmiast.
- **Po 5.4:** tabela w panelu na prawdziwych danych; przesunięcie czasu zmienia statusy.
- **Po 5.6:** linia cięcia osiągnięta — minimalne demo gotowe, dalsze kroki to bonus.
- **Po 5.9:** pełny przepływ UC-1…UC-5; feature freeze.

**Zasada pracy na kontrakcie:** `frontend/src/types/api.ts` jest **generowany** z Pydantic (ADR 0009) i nie wolno go edytować ręcznie. Gdy brakuje typu lub pola, zmiana idzie do `backend/app/schemas/`, a potem regeneracja:

```bash
cd backend && uv run python scripts/export_contract.py
npx --yes json-schema-to-typescript@15 -i contract/schema.json -o ../frontend/src/types/api.ts \
  --unreachableDefinitions --additionalProperties=false
```

Dzięki temu rozjazd nazw pól jest błędem kompilacji, a nie pustą kolumną na demo.

---

## 3. Decyzje architektoniczne

Pełne uzasadnienie i konsekwencje: **ADR 0010**.

1. **Nawigacja:** `react-router-dom` v7 w trybie **deklaratywnym** — `App.tsx` definiuje `<Routes>`, a `BrowserRouter` zakłada `main.tsx` (testy podstawiają `MemoryRouter`), więc trasy mają jedno źródło i nie ma zagnieżdżania routerów. Trasy: `/`, `/leases`, `/appeals`, `/baseline`, `/graph`, `/audit`; `*` przekierowuje na `/`. `AppShell` pełni rolę layout route. Etykiety nawigacji: `Pulpit`, `Dzierżawy`, `Odwołania`, `Standard zespołu`, `Graf`, `Audyt`.
2. **Stan serwerowy:** TanStack Query v5 — cache, stany ładowania/błędu i jednopunktowa inwalidacja po podróży w czasie. Bez globalnego store'a (Redux/Zustand).
3. **Typy generowane, nie pisane ręcznie:** `src/types/api.ts` pochodzi z kontraktu 1.2 (ADR 0009). Fixture'y używają typów z tego pliku (np. `LeaseOverview`), a flaga `VITE_USE_FIXTURES` przełącza **odczyty** na fixture'y (mutacje zawsze idą do API).
4. **Czas i status pochodzą z backendu.** „Teraz” czytamy z `GET /api/v1/simulation/clock` (`ClockRead.now`), a `status`, `days_remaining` i `recommendation` przychodzą policzone w `LeaseOverview`. Frontend **nie duplikuje** granic 7/0 dni i nie używa zegara systemowego; `lib/dateTime.ts` odpowiada za formatowanie i pomocnicze porównania (walidacja daty w modalu).
5. **Testy:** Vitest 5 + React Testing Library + MSW 3. Handlery MSW budowane z tych samych fixture'ów, które zasilają tryb `VITE_USE_FIXTURES`.
6. **Motyw:** ciemny domyślnie (ADR 0001, `PLAN.md`), komponenty wyłącznie na tokenach shadcn — ewentualna zmiana na jasny motyw jest jednopunktowa i nie wymaga refaktoryzacji komponentów.

---

## 4. Struktura katalogów

```
frontend/src/
├── main.tsx                 # QueryClientProvider + RouterProvider
├── App.tsx                  # definicja tras
├── index.css                # Tailwind v4 + tokeny shadcn (ciemny motyw domyślnie)
├── api/
│   ├── config.ts            # shouldUseFixtures() — czyta VITE_USE_FIXTURES
│   ├── client.ts            # getJson / postJson + ApiError
│   ├── fixtures/            # JSON-y w kształcie kontraktu + index.ts z typowanym re-exportem
│   └── leases.ts  simulation.ts  dashboard.ts  baseline.ts  appeals.ts  graph.ts  audit.ts
├── hooks/                   # useLeases, useSimulatedClock, useTimeTravel, useLeaseDecision, ...
├── lib/
│   ├── utils.ts             # cn()
│   ├── dateTime.ts          # formatowanie dat i porównania z czasem symulowanym
│   ├── statusBadges.ts      # etykiety i kolory statusów, ról, rekomendacji i odwołań
│   └── graphLayout.ts       # deterministyczny układ kolumnowy grafu (fallback bez position)
├── types/api.ts             # GENEROWANY z backend/contract/schema.json — nie edytować ręcznie
├── components/
│   ├── ui/                  # komponenty shadcn/ui
│   ├── layout/              # AppShell, Sidebar, TopBar, TimeTravelBar
│   └── dashboard/  leases/  appeals/  baseline/  graph/  audit/
├── pages/                   # 6 stron: składają hooki i komponenty
└── test/                    # setup.ts, renderWithProviders.tsx, msw/{server,handlers,state}.ts
```

**Spójność dokumentacji:** drzewo z `CODING_STANDARDS.md` (§3) rozszerzamy o `api/`, `pages/` i `test/`. Aktualizacja `CODING_STANDARDS.md` jest częścią zadania 5.1 (wymóg „kod i dokumentacja muszą być spójne” z `AGENTS.md`).

**Limit 300 linii** obowiązuje każdy plik; komponent przekraczający limit dzielimy w obrębie jego katalogu domenowego.

---

## 5. Kontrakt API (stan faktyczny po 1.2)

Źródłem prawdy jest `frontend/src/types/api.ts` (generowany). Poniżej tylko to, co frontend konsumuje.

**Dostępne w kontrakcie:**

| Typ | Kształt (skrót) | Użycie we froncie |
| --- | --- | --- |
| `Role` | `"read" \| "write" \| "admin"` | badge poziomu |
| `LeaseStatus` | `"ACTIVE" \| "WARNING" \| "EXPIRED"` | badge statusu |
| `Recommendation` | `"KEEP" \| "DOWNSCOPE" \| "REVOKE"` | kolumna rekomendacji |
| `DecisionAction` | `"EXTEND" \| "DOWNSCOPE" \| "REVOKE"` | modal decyzji |
| `Extension` | `preset_days?: 7\|14\|30\|90`, `multiplier?: 1.5\|2`, `custom_days?`, `until_date?` | modal decyzji |
| `DecisionRequest` | `{ action, extension?: Extension \| null, justification?: string \| null }` | `POST /leases/{id}/decision` |
| `LeaseOverview` | `{ id, user: UserRead, repository: RepositoryRead, current_role, granted_at, expires_at: string \| null, is_active, status, days_remaining: number \| null, last_activity_at: string \| null, recommendation }` | tabela dzierżaw |
| `UserRead` / `TeamRead` | `{ id, login, name, team: TeamRead \| null, is_admin }` / `{ id, name, slug }` | kolumny użytkownik i zespół |
| `ClockRead` | `{ now, offset_days }` | pasek czasu |
| `TimeTravelRequest` | `{ days: number }` (1…365) | presety i własna liczba dni |
| `DemoResetResult` | `{ now, offset_days, counts }` | reset scenariusza |
| `AppealCreate` / `AppealRead` | `{ lease_id, justification }` / `{ id, lease_id, user_id, repo_id, requested_role, justification, status, created_at, resolved_at }` | formularz i historia odwołań |
| `AuditLogRead` | `{ id, timestamp, actor_type, actor_id: number \| null, action, target, details: object, justification: string \| null }` | dziennik audytu |
| `BaselineEntry` | `{ team_id, repository: RepositoryRead, proposed_role, active_members, team_size }` | standard zespołu |
| `ActorType`, `AppealStatus`, `ActionType` | enumy | filtry i badge'y |

**Brakuje — do zamówienia u właścicieli kroków:**

| Czego brakuje | Kto | Do czego | Obejście na czas braku |
| --- | --- | --- | --- |
| `GET /api/v1/simulation/clock` | 2.5 | czas symulowany w pasku | fixture + MSW; po dostarczeniu zmiana tylko w `api/simulation.ts` |
| `GET /api/v1/leases` → `LeaseOverview[]` | 3.6 | tabela dzierżaw | fixture'y w kształcie `LeaseOverview` |
| Liczniki dashboardu | 4.6 | karty KPI | fixture + MSW |
| Payload grafu (React Flow `{nodes, edges}`) | 4.6 | graf | fixture + `lib/graphLayout.ts` jako fallback pozycji |
| Zatwierdzenie standardu + typ nowego członka | 4.2 | onboarding UC-1 | fixture + MSW |
| Statystyki aktywności per dzierżawa | 4.4 | modal decyzji (UC-3) | fixture + MSW |
| Lista odwołań / historia per dzierżawa | 4.4 | widok odwołań | fixture + MSW |

**Błędy:** `ApiError { status: number; message: string }` normalizuje `{"detail": ...}` (FastAPI) oraz `{"message": ..., "documentation_url": ...}` (konwencja GitHuba, ADR 0004). Dla `403` przy akcji `REVOKE`/`DOWNSCOPE` modal pokazuje stały komunikat: *„Nie można odebrać uprawnień ostatniemu administratorowi.”*

---

## 6. Semantyka czasu i statusów

- **Źródło czasu:** `GET /api/v1/simulation/clock` → `ClockRead.now` (ISO 8601 UTC) i `offset_days`. Frontend nigdy nie używa zegara systemowego w logice dzierżaw.
- **Źródło statusu:** `LeaseOverview.status`, `days_remaining` i `recommendation` — liczone przez backend (`LeaseService`) z historii zdarzeń i zegara. Frontend **nie powtarza** granic 7/0 dni; po podróży w czasie unieważnia cache i pobiera świeże wartości, więc rozjazd FE/BE jest niemożliwy.
- **`lib/dateTime.ts`** — jedno źródło formatowania i porównań pomocniczych:

```ts
export const DISPLAY_TIME_ZONE = 'Europe/Warsaw';
export const DAY_MS = 86_400_000;

export function formatDateTimePl(iso: string): string;               // "3 października 2026, 15:24"
export function formatDaysRemaining(days: number | null): string;    // "Pozostało 12 dni" | "Wygasa dziś" | "Wygasła 3 dni temu" | "—"
export function formatOffsetDays(offset_days: number): string;       // "+15 dni" | "−15 dni" | "0 dni"
export function daysRemaining(expires_at: string, now: string): number; // walidacja daty w modalu (Math.ceil, może być ujemne)
```

Funkcja `leaseStatus()` **nie istnieje** po stronie frontendu — świadome odejście od przykładu w `CODING_STANDARDS.md`, bo kontrakt 1.2 przeniósł tę regułę do backendu (mniej miejsc na rozjazd). `daysRemaining` służy wyłącznie do walidacji „data musi być późniejsza niż czas symulowany”; wartość pokazywana w tabeli pochodzi z API.

**Dwie pułapki odnotowane w implementacji:**
- `Intl.DateTimeFormat('pl-PL', { dateStyle, timeStyle })` skleja datę i godzinę **spacją**, nie przecinkiem; `formatDateTimePl` składa więc wynik z `formatToParts` i wstawia `, ` — dzięki temu format jest zgodny z projektem i deterministyczny w Node i w przeglądarkach.
- `daysRemaining` może zwrócić `-0` dla ułamka dnia przed wygaśnięciem; `formatDaysRemaining(-0)` daje `Wygasa dziś`. Testy granic przypinamy do dokładnych wartości (`now === expires_at` → 0), a nie do przedziału `(-1, 0)`.

- **`lib/statusBadges.ts`** mapuje: statusy → `Aktywna` / `Wygasa wkrótce` / `Wygasła`, role → `Administrator` / `Zapis (write)` / `Odczyt (read)`, rekomendacje → `Bez zmian` / `Zdeeskaluj` / `Odbierz`, statusy odwołań → `Oczekujące` / `Zatwierdzone` / `Odrzucone`. Poza tym plikiem nie wolno powtarzać tych mapowań.
- **Pasek czasu:** presety `+15 / +30 / +60` dni, pole własnej liczby dni (walidacja `1…365` zgodnie z `TimeTravelRequest`), `Reset` wywołujący `POST /api/v1/demo/reset` (przywraca seed i zeruje zegar — wymaga potwierdzenia, bo kasuje stan; przy `ENABLE_DEMO_RESET=false` zwraca `404`).

---

## 7. Widoki

Wspólne zasady: brak własnych kolorów i etykiet statusów (tylko `statusBadges`), każdy widok obsługuje stan ładowania (Skeleton), błędu (komunikat + „Odśwież”) i pusty („Brak danych do wyświetlenia”).

1. **Dashboard (`/`)** — cztery karty KPI z 4.6: Aktywne dzierżawy, Ostrzeżenia, Wygaśnięte, Rekomendacje deeskalacji. Wartości odświeżają się po podróży w czasie i po decyzjach.
2. **Dzierżawy (`/leases`)** — tabela: Użytkownik, Zespół, Repozytorium, Poziom, Ostatnia aktywność, Pozostało, Status, Rekomendacja. Sortowanie: `EXPIRED` → `WARNING` → `ACTIVE`, w grupie rosnąco po `days_remaining`, dzierżawy bez terminu (`days_remaining: null`, czyli `admin`) na końcu. Akcja wiersza „Decyzja” otwiera modal.
3. **Modal decyzji** — kontekst dzierżawy oraz: **Przedłuż** (`extension` z `preset_days` +7/+14/+30/+90, `multiplier` 1,5x/2x, `custom_days`, `until_date`), **Wyłącz** (`REVOKE`, z potwierdzeniem), **Zdeeskaluj** (`DOWNSCOPE`). Po sukcesie toast i inwalidacja `['leases']`, `['dashboard']`, `['audit']`, `['appeals']`, `['graph']`.
4. **Odwołania (`/appeals`)** — lista dzierżaw w oknie ostrzegawczym i wygasłych, formularz odwołania (`AppealCreate`: wybór dzierżawy + wymagane uzasadnienie) oraz lista złożonych odwołań; pozycja `PENDING` ma akcję „Rozpatrz”, otwierającą modal decyzji z historią odwołań i statystykami użycia (UC-3). Ponieważ `AppealRead` zawiera tylko `user_id`, dane osoby łączymy z listą dzierżaw po `lease_id`.
5. **Standard zespołu (`/baseline`)** — sekcje DEV i QA: repozytorium, proponowana rola (nigdy `admin`), udział aktywnych członków (`active_members / team_size`); zatwierdzenie standardu dla nowego członka zespołu jednym kliknięciem (UC-1).
6. **Graf (`/graph`)** — `@xyflow/react` na danych z 4.6: węzły użytkowników, zespołów i repozytoriów, krawędzie członkostwa i dzierżaw, kolor wg statusu; filtry: zespół oraz „tylko podwyższone ryzyko”. Gdy backend nie dostarczy `position`, pozycje wylicza deterministycznie `lib/graphLayout.ts` (trzy kolumny: użytkownicy, zespoły, repozytoria).
7. **Audyt (`/audit`)** — tabela: Czas, Aktor, Akcja, Cel, Uzasadnienie; `details` (obiekt JSON) pokazywany jako zwięzły podgląd; filtr aktora (`Wszystkie`, `ADMIN`, `USER`, `SYSTEM`) po stronie klienta.

---

## 8. Testy i dowody

- **TDD** w każdym zadaniu: test przed implementacją, minimalny kod, refaktor.
- **Trzy poziomy:** funkcje czyste (`lib/`) → komponenty i strony (RTL + MSW) → test integracyjny przepływu pitch (`App.integration.test.tsx`).
- **MSW jako jedyne mockowanie sieci:** handlery zbudowane z fixture'ów; stan symulowanego zegara trzymany w `test/msw/state.ts`, więc po skoku czasu interfejs pobiera świeże, policzone przez backend wartości.
- **`renderWithProviders`** (świeży `QueryClient` z `retry: false`, `MemoryRouter`) w `src/test/`.
- **Dowody w PR:** `cd frontend && npm test -- --run && npm run build && npm run lint` (wszystkie zielone) oraz zrzut/opis ręcznego sprawdzenia nowego widoku.

---

## 9. Ryzyka i mitygacje

| Ryzyko | Mitygacja |
| --- | --- |
| Brakujące endpointy (2.5, 3.6, 4.2–4.6) | fixture'y w kształcie kontraktu + flaga `VITE_USE_FIXTURES`; zmiany kontraktu lądują tylko w `api/*` |
| Rozjazd nazw pól między frontem a backendem | typy generowane z Pydantic (ADR 0009) — literówka jest błędem kompilacji |
| Rozbieżność presetów czasu (`+15/+30/+60` z UC-4 vs `+25/+35` w pitch flow) | presety z UC-4 **plus** pole własnej liczby dni (1…365) — pitch odtwarzalny co do dnia |
| `403` ostatniego admina wygląda jak awaria | stały komunikat PL w modalu + test na ścieżkę błędu |
| `Reset` kasuje bazę i seed | przycisk z potwierdzeniem i jasnym opisem; obsłużony `404` przy wyłączonym resecie |
| Dane grafu nie w formacie React Flow | adapter w `api/graph.ts` + deterministyczny układ kolumnowy w `lib/graphLayout.ts` |
| Osoba 6 przejmuje 5.10 | widok audytu samodzielny, bez zależności od pozostałych widoków |

---

## 10. Kryteria akceptacji

**Po linii cięcia (5.6):**
1. Dashboard pokazuje cztery liczniki z API.
2. Przesunięcie czasu o `+25 dni` zmienia statusy dzierżaw na `WARNING` i pokazuje rekomendacje deeskalacji.
3. Decyzja „Przedłuż 2x” oraz „Zdeeskaluj” działają z poziomu modala i są widoczne w tabeli.
4. Próba odebrania uprawnień ostatniemu administratorowi pokazuje komunikat ochrony (UC-5).
5. `npm test -- --run`, `npm run build`, `npm run lint` — zielone.

**Po 5.9 (feature freeze):** dodatkowo onboarding ze standardu zespołu (UC-1), złożenie i rozpatrzenie odwołania z historią i statystykami (UC-3), graf relacji oraz dziennik audytu. Wszystkie kroki pitch flow z `PLAN.md` Faza 4 są odtwarzalne na żywo.
