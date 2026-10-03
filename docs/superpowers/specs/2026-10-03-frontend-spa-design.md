# Specyfikacja: Frontend SPA — GitHub Access Lease Governor

**Data:** 2026-10-03
**Autor:** Osoba 5 (KUBUŚ) — cały frontend (`frontend/`)
**Status:** do przeglądu przed planem implementacji
**Powiązane dokumenty:** `PRODUKT.md`, `PLAN.md`, `GLOSSARY.md`, `CODING_STANDARDS.md`, ADR 0001–0006, `docs/superpowers/plans/2026-10-03-frontend-spa.md`

---

## 1. Cel i zakres

Zbudować cały frontend jako SPA — konsolę administratora bezpieczeństwa IT (Security Admin Panel) do zarządzania odnawialnymi dzierżawami dostępów GitHuba. Zakres odpowiada krokom **5.1–5.10** z podziału pracy zespołu.

**Linia cięcia po 5.6.** Do tego miejsca działa UC-2 (deeskalacja), UC-4 (sterowanie czasem) i UC-5 (ochrona ostatniego administratora) — minimalne demo. Kroki 5.7–5.10 (onboarding UC-1, odwołania UC-3, graf, audyt) są bonusem realizowanym po osiągnięciu linii cięcia.

**W zakresie:** 10 PR-ów z tabeli podziału pracy, `AppShell` z nawigacją, pasek czasu (Time Travel), tabela dzierżaw, modal decyzji, dashboard z licznikami, widok baseline z onboardingiem, formularz i historia odwołań, graf `@xyflow/react`, dziennik audytu, warstwa API, testy jednostkowe/komponentowe/integracyjne.

**Poza zakresem (YAGNI):** i18n, przełącznik motywów (ciemny domyślnie), logowanie i role w UI (jedna konsola admina, symulująca także stronę użytkownika składającego odwołanie), generowanie klienta z OpenAPI, Storybook, testy e2e w przeglądarce, biblioteka wykresów, moduł wyjaśnień LLM (M8), MSW w przeglądarce (tylko testy).

---

## 2. Zależności międzyzespołowe i punkty synchronizacji

| Krok | Dostarcza | Czego potrzebuje frontend |
| --- | --- | --- |
| 1.2 | Schematy Pydantic + typy TS (kontrakt) | zgodność nazw pól DTO z `src/types/api.ts` |
| 2.5 | `POST /api/v1/simulation/time-travel` | kształt żądania/odpowiedzi oraz odczyt bieżącego czasu symulowanego |
| 3.6 | lista dzierżaw + decyzje | pola DTO, w tym `last_activity` i `recommended_action` |
| 4.2 | onboarding / baseline | kształt odpowiedzi oraz ścieżka i payload zatwierdzenia |
| 4.3–4.5 | odwołania, historia odwołań, audyt | endpointy, filtry, kody błędów |
| 4.6 | liczniki dashboardu + dane grafu | nazwy liczników oraz format węzłów/krawędzi React Flow |
| 6.1 | fixture'y JSON dla frontu | zgodność z kontraktem 1.2 |

**Punkty synchronizacji zespołu (z planu pracy):**

- **Po 1.2 i 6.1:** kontrakt przyjęty, frontend pracuje na fixture'ach (5.1–5.3).
- **Po 5.4:** tabela w panelu na prawdziwych danych; przesunięcie czasu zmienia statusy.
- **Po 5.6:** linia cięcia osiągnięta — minimalne demo gotowe, dalsze kroki to bonus.
- **Po 5.9:** pełny przepływ UC-1…UC-5; feature freeze.

**Zasada contract-first:** frontend definiuje oczekiwane kształty w `src/types/api.ts` i buduje na fixture'ach. Rozjazd z rzeczywistym API naprawiamy **wyłącznie** w `src/types/api.ts` oraz `src/api/*` — komponenty i hooki nie znają kształtu transportu.

---

## 3. Decyzje architektoniczne

Pełne uzasadnienie i konsekwencje: **ADR 0006**.

1. **Nawigacja:** `react-router-dom` v7 (tryb deklaratywny). Trasy: `/`, `/leases`, `/appeals`, `/baseline`, `/graph`, `/audit`; `*` przekierowuje na `/`. `AppShell` pełni rolę layout route.
2. **Stan serwerowy:** TanStack Query v5 — cache, stany ładowania/błędu i jednopunktowa inwalidacja po podróży w czasie. Bez globalnego store'a (Redux/Zustand).
3. **Praca na kontrakcie:** `src/types/api.ts` jako źródło DTO; fixture'y JSON z typowanym re-exportem (rozjazd = błąd kompilacji); flaga `VITE_USE_FIXTURES` przełącza **odczyty** na fixture'y (mutacje zawsze idą do API).
4. **Czas symulowany:** jedynym źródłem „teraz" jest backend (`GET /api/v1/simulation/clock`). Frontend nie używa zegara systemowego w logice dzierżaw; status i „pozostało dni" liczy `lib/dateTime.ts`.
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
│   ├── fixtures/            # JSON-y (6.1) + index.ts z typowanym re-exportem
│   └── leases.ts  simulation.ts  dashboard.ts  baseline.ts  appeals.ts  graph.ts  audit.ts
├── hooks/                   # useLeases, useSimulatedClock, useTimeTravel, useLeaseDecision, ...
├── lib/
│   ├── utils.ts             # cn()
│   ├── dateTime.ts          # cała matematyka czasu (jedno źródło prawdy)
│   ├── statusBadges.ts      # etykiety i kolory statusów oraz ról (jedno źródło prawdy)
│   └── graphLayout.ts       # deterministyczny układ kolumnowy grafu (fallback bez position)
├── types/api.ts             # kontrakt DTO
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

## 5. Kontrakt API

Pola DTO w `snake_case` — 1:1 z odpowiedziami Pydantic (bez warstwy mapowania). Nazwy pól do potwierdzenia w kroku 1.2.

```ts
export type Role = 'admin' | 'write' | 'read';
export type LeaseStatus = 'ACTIVE' | 'WARNING' | 'EXPIRED';
export type ActivityType = 'PushEvent' | 'PullRequestReviewEvent' | 'IssueCommentEvent';
export type RecommendedAction = 'downscope' | 'revoke' | null;

export interface SimulatedClock { simulated_now: string; offset_days: number }
export interface TimeTravelRequest { days?: number; reset?: boolean }

export interface Lease {
  id: number;
  user: { login: string; name: string; team: string };
  repository: { owner: string; name: string };
  role: Role;
  granted_at: string;
  expires_at: string;
  last_activity: { type: ActivityType; occurred_at: string } | null;
  recommended_action: RecommendedAction;
}
export interface LeaseListResponse { leases: Lease[] }

export interface LeaseDecisionRequest {
  action: 'extend' | 'revoke' | 'downscope';
  days?: number;
  date?: string;
  multiplier?: number;
  justification?: string;
}

export interface DashboardCounters {
  active: number;
  warning: number;
  expired: number;
  downscope_recommendations: number;
}

export interface BaselineEntry {
  repository: { owner: string; name: string };
  proposed_role: Role;
  active_members: number;
  team_size: number;
}
export interface BaselineResponse { team: string; entries: BaselineEntry[] }
export interface NewMember { login: string; name: string }

export type AppealStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Appeal {
  id: number;
  lease_id: number;
  user: { login: string; name: string; team: string };
  justification: string;
  status: AppealStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface LeaseActivityStats { push: number; review: number; comment: number }

export interface AuditEntry {
  id: number;
  timestamp: string;
  actor_type: 'ADMIN' | 'USER' | 'SYSTEM';
  actor_id: string;
  action: string;
  target: string;
  details: string;
  justification: string | null;
}

export interface GraphNode {
  id: string;
  type: 'user' | 'team' | 'repo';
  position?: { x: number; y: number };
  data: { label: string; status?: LeaseStatus; team?: string };
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data?: { role?: Role; status?: LeaseStatus };
}
export interface GraphResponse { nodes: GraphNode[]; edges: GraphEdge[] }
```

### Endpointy

| Metoda i ścieżka | Przeznaczenie | Status |
| --- | --- | --- |
| `GET /api/v1/simulation/clock` | bieżący czas symulowany i offset | potwierdzony przez backend (2.5) |
| `POST /api/v1/simulation/time-travel` | `{days}` lub `{reset: true}` → nowy stan zegara | 2.5, kształt do potwierdzenia |
| `GET /api/v1/leases` | lista dzierżaw dla tabeli | 3.6; wymagane `last_activity` i `recommended_action` |
| `POST /api/v1/leases/{id}/decision` | przedłuż / wyłącz / zdeeskaluj | 3.6; `403` przy próbie odebrania ostatniego admina |
| `GET /api/v1/dashboard` | liczniki KPI | 4.6, nazwy pól do potwierdzenia |
| `GET /api/v1/baseline/{team_id}` | standard zespołu | 4.1 |
| `POST /api/v1/baseline/{team_id}/approve` | zatwierdzenie onboardingu | 4.2, ścieżka i payload do potwierdzenia |
| `POST /api/v1/appeals` | złożenie odwołania (`lease_id`, `justification`) | 4.3; duplikat uzasadnienia → `4xx` |
| `GET /api/v1/appeals` | lista odwołań i historia dla admina | 4.4 |
| `GET /api/v1/leases/{id}/activity-stats` | statystyki użycia (`push`/`review`/`comment`) w modalu decyzji | 4.4, do potwierdzenia |
| `POST /api/v1/appeals/{id}/decision` | decyzja w kontekście odwołania | istniejący kontrakt v1 |
| `GET /api/v1/audit` | dziennik audytu | 4.5 |
| `GET /api/v1/graph` | węzły i krawędzie w formacie React Flow | 4.6 |

**Błędy:** `ApiError { status: number; message: string }` normalizuje `{"detail": ...}` (FastAPI) oraz `{"message": ..., "documentation_url": ...}` (konwencja GitHuba, ADR 0004). Dla `403` przy akcji `revoke`/`downscope` modal pokazuje stały komunikat: *„Nie można odebrać uprawnień ostatniemu administratorowi.”*

---

## 6. Semantyka czasu i statusów

`lib/dateTime.ts` to jedyne miejsce, w którym porównujemy daty. Funkcje są czyste i przyjmują `simulated_now` jako parametr — bez mockowania zegara w testach.

```ts
export const DAY_MS = 86_400_000;
export const WARNING_WINDOW_DAYS = 7;
export const DISPLAY_TIME_ZONE = 'Europe/Warsaw';

export function daysRemaining(expires_at: string, simulated_now: string): number;
export function leaseStatus(expires_at: string, simulated_now: string): LeaseStatus;
export function formatDateTimePl(iso: string): string;
export function formatDaysRemaining(expires_at: string, simulated_now: string): string;
export function formatOffsetDays(offset_days: number): string;
```

**Granice statusów (spójne z backendem, `PLAN.md` Faza 2):**

| Warunek (`diff = expires_at − simulated_now`) | Status |
| --- | --- |
| `diff > 7 dni` | `ACTIVE` |
| `0 < diff <= 7 dni` | `WARNING` |
| `diff <= 0` | `EXPIRED` |

Dokładnie 7 dni → `WARNING`; dokładnie 0 → `EXPIRED`. `daysRemaining` zaokrągla w górę (`Math.ceil`), więc części dnia liczą się jako pełny dzień.

**Formatowanie (deterministyczne, strefa `Europe/Warsaw`):** `formatDaysRemaining` zwraca `Pozostało 12 dni`, `Pozostało 1 dzień`, `Wygasa dziś` (0) lub `Wygasła 3 dni temu`. `formatOffsetDays` zwraca `+15 dni` / `−15 dni`. `formatDateTimePl` zwraca np. `3 października 2026, 15:24`.

`lib/statusBadges.ts` mapuje statusy na etykiety (`Aktywna`, `Wygasa wkrótce`, `Wygasła`) i klasy kolorów, role na etykiety (`Administrator`, `Zapis (write)`, `Odczyt (read)`), a rekomendacje na etykiety (`Zdeeskaluj`, `Odbierz`). Statusy odwołań mają w tym samym pliku osobne mapowanie (`Oczekujące`, `Zatwierdzone`, `Odrzucone`). Poza tym plikiem nie wolno powtarzać tych mapowań.

---

## 7. Widoki

Wspólne zasady: brak własnych kolorów statusów (tylko `statusBadges`), każdy widok obsługuje stan ładowania (Skeleton), błędu (komunikat + „Odśwież”) i pusty („Brak danych do wyświetlenia”).

1. **Dashboard (`/`)** — cztery karty KPI z 4.6: Aktywne dzierżawy, Ostrzeżenia, Wygaśnięte, Rekomendacje deeskalacji. Wartości odświeżają się po podróży w czasie i po decyzjach.
2. **Dzierżawy (`/leases`)** — tabela: Użytkownik, Zespół, Repozytorium, Poziom, Ostatnia aktywność, Pozostało, Status (badge). Domyślne sortowanie: najpierw `EXPIRED`, potem `WARNING`, potem `ACTIVE`; w grupie rosnąco po `daysRemaining`. Akcja wiersza „Decyzja” otwiera modal.
3. **Modal decyzji** — kontekst dzierżawy oraz: **Przedłuż** (presety `+7 / +14 / +30 / +90`, mnożniki `1,5x / 2x`, własna liczba dni, dokładna data), **Wyłącz** (z potwierdzeniem), **Zdeeskaluj**. Po sukcesie toast i inwalidacja `['leases']`, `['dashboard']`, `['audit']`, `['appeals']`, `['graph']`.
4. **Odwołania (`/appeals`)** — lista dzierżaw w oknie ostrzegawczym i wygasłych, formularz odwołania (wybór dzierżawy + wymagane uzasadnienie) oraz historia odwołań użytkownika i statystyki aktywności prezentowane w modalu decyzji (UC-3).
5. **Standard zespołu (`/baseline`)** — sekcje DEV i QA: repozytorium, proponowana rola (nigdy `admin`), udział aktywnych członków; zatwierdzenie standardu dla nowego członka zespołu jednym kliknięciem (UC-1).
6. **Graf (`/graph`)** — `@xyflow/react` na danych z 4.6: węzły użytkowników, zespołów i repozytoriów, krawędzie członkostwa i dzierżaw, kolor wg statusu; filtry: zespół oraz „tylko podwyższone ryzyko”. Gdy backend nie dostarczy `position`, pozycje wylicza deterministycznie `lib/graphLayout.ts` (trzy kolumny: użytkownicy, zespoły, repozytoria).
7. **Audyt (`/audit`)** — tabela: Czas, Aktor, Akcja, Cel, Uzasadnienie; filtr aktora (`Wszystkie`, `ADMIN`, `USER`, `SYSTEM`) po stronie klienta.

**Pasek czasu (`TimeTravelBar`, w `TopBar`)** — wyświetla sformatowany czas symulowany i offset, przyciski `+15 dni`, `+30 dni`, `+60 dni`, pole własnej liczby dni (dodatnia liczba całkowita) oraz `Reset`. Po sukcesie inwaliduje cały cache; w trakcie mutacji przyciski są zablokowane.

---

## 8. Testy i dowody

- **TDD** w każdym zadaniu: test przed implementacją, minimalny kod, refaktor.
- **Trzy poziomy:** funkcje czyste (`lib/`) → komponenty i strony (RTL + MSW) → test integracyjny przepływu pitch (`App.integration.test.tsx`).
- **MSW jako jedyne mockowanie sieci:** handlery zbudowane z fixture'ów; stan symulowanego zegara trzymany w `test/msw/state.ts`, dzięki czemu statusy przeliczają się po stronie klienta tak jak w produkcji.
- **`renderWithProviders`** (świeży `QueryClient` z `retry: false`, `MemoryRouter`) w `src/test/`.
- **Dowody w PR:** `cd frontend && npm test -- --run && npm run build && npm run lint` (wszystkie zielone) oraz zrzut/opis ręcznego sprawdzenia nowego widoku.

---

## 9. Ryzyka i mitygacje

| Ryzyko | Mitygacja |
| --- | --- |
| Kontrakt 1.2 jeszcze nie istnieje lub różni się od oczekiwań | contract-first + typowany re-export fixture'ów; poprawki tylko w `types/api.ts` i `api/*`; jawny krok synchronizacji po 1.2/6.1 |
| Backend nie gotowy na 5.4 | flaga `VITE_USE_FIXTURES` pozwala rozwijać i prezentować odczyty bez API |
| Rozbieżność presetów czasu (`+15/+30/+60` w UC-4 vs `+25/+35` w pitch flow) | presety z UC-4 **plus** pole własnej liczby dni — pitch odtwarzalny co do dnia |
| Brak `last_activity` w DTO (model `Lease` go nie przechowuje) | wymaganie wobec 3.6/4.6 wypisane w kontrakcie; alternatywa: N+1 odpytywanie zdarzeń (odrzucona) |
| `403` ostatniego admina wygląda jak awaria | stały komunikat PL w modalu + test na ścieżkę błędu |
| Dane grafu nie w formacie React Flow | adapter w `api/graph.ts` + deterministyczny układ kolumnowy w `lib/graphLayout.ts` |
| Osoba 6 przejmuje 5.10 | widok audytu samodzielny, bez zależności od pozostałych widoków |
| Rozjazd czasu frontend/backend | granice 7/0 dni wypisane w spec i pokryte testami; frontend nigdy nie używa zegara systemowego |

---

## 10. Kryteria akceptacji

**Po linii cięcia (5.6):**
1. Dashboard pokazuje cztery liczniki z API.
2. Przesunięcie czasu o `+25 dni` zmienia statusy dzierżaw na `WARNING` i pokazuje rekomendacje deeskalacji.
3. Decyzja „Przedłuż 2x” oraz „Zdeeskaluj” działają z poziomu modala i są widoczne w tabeli.
4. Próba odebrania uprawnień ostatniemu administratorowi pokazuje komunikat ochrony (UC-5).
5. `npm test -- --run`, `npm run build`, `npm run lint` — zielone.

**Po 5.9 (feature freeze):** dodatkowo onboarding ze standardu zespołu (UC-1), złożenie i rozpatrzenie odwołania z historią i statystykami (UC-3), graf relacji oraz dziennik audytu. Wszystkie kroki pitch flow z `PLAN.md` Faza 4 są odtwarzalne na żywo.
