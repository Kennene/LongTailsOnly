# Plan implementacji: Frontend SPA (Osoba 5)

> **Dla agentów wykonujących:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecane) albo `superpowers:executing-plans`. Kroki mają składnię checkbox (`- [ ]`) do śledzenia postępu.

**Cel:** Zbudować cały frontend (`frontend/`) jako SPA — konsolę Security Admina do zarządzania dzierżawami dostępów GitHuba — w 10 krokach (PR 5.1–5.10), z linią cięcia po 5.6.

**Architektura:** React 19 + React Compiler; `react-router-dom` v7 dla nawigacji; TanStack Query v5 dla stanu serwerowego; kontrakt DTO w `src/types/api.ts` z fixture'ami i flagą `VITE_USE_FIXTURES`; czas symulowany wyłącznie z `GET /api/v1/simulation/clock`; cała matematyka czasu w `lib/dateTime.ts`, etykiety i kolory w `lib/statusBadges.ts`; testy Vitest + RTL + MSW na tych samych fixture'ach.

**Stos:** react 19.3 · vite 8.3 · typescript (szablon Vite) · tailwindcss 4.3 (`@tailwindcss/vite`) · shadcn CLI 4.21 · react-router-dom 7.18 · @tanstack/react-query 5.104 · msw 3.0 · vitest 5.0 · @testing-library/react 16.3 · @xyflow/react 12.12 · sonner 2.0 · babel-plugin-react-compiler 1.0 + @rolldown/plugin-babel · Node 24.

**Spec:** `docs/superpowers/specs/2026-10-03-frontend-spa-design.md`

## Globalne ograniczenia

- **Limit 300 linii na plik** (`CODING_STANDARDS.md` §1). Komponent przekraczający limit dzielimy w obrębie jego katalogu domenowego.
- **Deklaracje funkcji z jawnymi typami** parametrów i wartości zwracanej; brak eksportowanych funkcji strzałkowych.
- **Zakaz ręcznych `useMemo` / `useCallback`** — memoizację zapewnia React Compiler (`CODING_STANDARDS.md` §3).
- **Jedno źródło prawdy:** żadnych obliczeń dat poza `src/lib/dateTime.ts`; żadnych etykiet ani kolorów statusów/ról poza `src/lib/statusBadges.ts`.
- **Zakaz `Date.now()`** w logice dzierżaw — czas pochodzi z `simulated_now` (parametr funkcji lub `useSimulatedClock()`).
- **DTO w `snake_case`**, 1:1 z odpowiedziami Pydantic (`types/api.ts` ze spec §5); zmiany kontraktu wyłącznie w `types/api.ts` i `api/*`.
- **Strefa wyświetlania dat:** `Europe/Warsaw` (`DISPLAY_TIME_ZONE`), żeby testy były deterministyczne na każdej maszynie.
- **Granice statusów:** `diff <= 0` → `EXPIRED`; `0 < diff <= 7 dni` → `WARNING`; inaczej `ACTIVE`. `daysRemaining` zaokrągla w górę.
- **Presety paska czasu:** `+15`, `+30`, `+60` dni + pole własnej liczby dni + `Reset`.
- **Opcje przedłużenia w modalu:** presety `+7 / +14 / +30 / +90`, mnożniki `1,5x / 2x`, własna liczba dni, dokładna data.
- **Język:** teksty UI i komunikaty po polsku; nazwy plików, funkcji, typów i testów po angielsku.
- **Endpointy:** wyłącznie `/api/v1/...`; bazowy adres przez proxy Vite (`/api` → `http://localhost:8000`), bez CORS.
- **Weryfikacja każdego zadania:** `cd frontend && npm test -- --run && npm run build && npm run lint` — wszystkie zielone przed commitem.
- **Commity** konwencją conventional commits, po angielsku (np. `feat(frontend): ...`).

## Zakres przeglądu (Review Focus)

Pięć klas danych/sytuacji, które spec implikuje, a które najczęściej psują demo — każda ma test w zadaniu wskazanym obok:

1. **Granice czasu dokładnie na 7 i 0 dni oraz daty przeszłe** — status i tekst „pozostało" muszą być poprawne także dla wartości ujemnych (zadanie 2, testy `leaseStatus` / `formatDaysRemaining`; zadanie 3, render wiersza `EXPIRED`).
2. **Walidacja wejścia** — własna liczba dni w pasku czasu (`0`, liczby ujemne, tekst, ułamek), data z przeszłości w modalu, puste uzasadnienie odwołania: brak żądania do API i widoczny komunikat (zadania 5, 7, 10).
3. **Ścieżki błędów API** — `403` ostatniego admina, `409` duplikatu uzasadnienia, `500` na dashboardzie, brak backendu przy `VITE_USE_FIXTURES=false`: komunikat, nie biały ekran (zadania 6, 7, 8, 10).
4. **Stany puste i zerowe** — brak dzierżaw, zerowe liczniki, brak odwołań, graf bez krawędzi, audyt bez zdarzeń (zadania 3, 8, 10, 12, 13).
5. **Polskie znaki i długie treści** — diakrytyki w etykietach oraz długie uzasadnienie/`details` nie mogą rozsadzać tabeli ani modala (zadania 3, 11, 13).

---

## Struktura plików

| Ścieżka | Odpowiedzialność |
| --- | --- |
| `frontend/src/types/api.ts` | kontrakt DTO (jedno źródło kształtów) |
| `frontend/src/api/config.ts` | `shouldUseFixtures()` — czyta `VITE_USE_FIXTURES` |
| `frontend/src/api/client.ts` | `getJson`/`postJson` + `ApiError` |
| `frontend/src/api/{leases,simulation,dashboard,baseline,appeals,graph,audit}.ts` | jedno miejsce styku z transportem; tu żyje flaga fixture'ów |
| `frontend/src/api/fixtures/*.json` + `index.ts` | dane 6.1 z typowanym re-exportem |
| `frontend/src/lib/dateTime.ts` | cała matematyka czasu |
| `frontend/src/lib/statusBadges.ts` | etykiety i kolory statusów oraz ról |
| `frontend/src/lib/graphLayout.ts` | deterministyczny układ kolumnowy grafu (fallback bez `position`) |
| `frontend/src/hooks/*.ts` | hooki TanStack Query per domena |
| `frontend/src/components/layout/*` | `AppShell`, `Sidebar`, `TopBar`, `TimeTravelBar` |
| `frontend/src/components/{leases,appeals,baseline,graph,audit,dashboard}/*` | komponenty domenowe |
| `frontend/src/pages/*.tsx` | 6 stron: hooki + komponenty + stany |
| `frontend/src/test/*` | `setup.ts`, `renderWithProviders.tsx`, `msw/{server,handlers,state}.ts` |

---

### Zadanie 1 (PR 5.1): Szkielet SPA, motyw ciemny, nawigacja i infrastruktura testów

**Pliki:**
- Utwórz: `frontend/` (szablon Vite: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/index.css`, `src/App.tsx`)
- Utwórz: `frontend/src/components/layout/AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx`
- Utwórz: `frontend/src/pages/{DashboardPage,LeasesPage,AppealsPage,BaselinePage,GraphPage,AuditPage}.tsx`
- Utwórz: `frontend/src/test/setup.ts`, `frontend/src/test/renderWithProviders.tsx`, `frontend/src/test/msw/server.ts`, `frontend/src/test/msw/handlers.ts`
- Zmień: `CODING_STANDARDS.md` (drzewo katalogów frontendu — dodać `api/`, `pages/`, `test/`)
- Test: `frontend/src/App.test.tsx`

**Interfejsy:**
- Produkuje: `renderWithProviders(ui: React.ReactElement, options?: { route?: string }): RenderResult & { queryClient: QueryClient }`; `server` (MSW `setupServer`) z `test/msw/server.ts`; `handlers: HttpHandler[]` (startowo pusta tablica); trasy i etykiety nawigacji: `Dashboard`, `Dzierżawy`, `Odwołania`, `Standard zespołu`, `Graf`, `Audyt`; `AppShell` renderuje `Sidebar`, `TopBar` i `<Outlet />`.
- Konsumuje: nic (pierwsze zadanie).

- [ ] **Krok 1: Utwórz projekt Vite i zainstaluj bazę.**

Z katalogu głównego repozytorium:
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
npm install tailwindcss @tailwindcss/vite react-router-dom @tanstack/react-query
npm install -D @types/node vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event msw
npm install -D babel-plugin-react-compiler@latest @rolldown/plugin-babel
npm install -D shadcn@latest
```
W `src/index.css` zastąp zawartość dyrektywą `@import "tailwindcss";`.

- [ ] **Krok 2: Skonfiguruj alias, Tailwind i React Compiler w `vite.config.ts`.**

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'] },
});
```
W `tsconfig.json` dodaj `"baseUrl": "."`, `"paths": { "@/*": ["./src/*"] }` oraz `"types": ["vitest/globals", "@testing-library/jest-dom"]`. Dodaj skrypty: `"test": "vitest"`, `"lint": "eslint ."` (jeśli brak).

- [ ] **Krok 3: Zainicjuj shadcn/ui i dodaj komponenty bazowe.**

```bash
npx shadcn@latest init
npx shadcn@latest add alert badge button calendar card dialog input label popover select separator skeleton sonner table tabs textarea
```
W `index.html` ustaw `<html lang="pl" class="dark">`. W `src/main.tsx` zamontuj `<Sonner />` (toaster) i `QueryClientProvider` z klientem `{ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }`.

- [ ] **Krok 4: Napisz failing test `renders_shell_navigation_and_routes`.**

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import App from '@/App';

it('renders navigation for all six views and switches route', async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/' });

  for (const label of ['Dashboard', 'Dzierżawy', 'Odwołania', 'Standard zespołu', 'Graf', 'Audyt']) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  }

  await user.click(screen.getByRole('link', { name: 'Dzierżawy' }));
  expect(await screen.findByRole('heading', { name: 'Dzierżawy' })).toBeInTheDocument();
});
```

- [ ] **Krok 5: Uruchom test i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/App.test.tsx`
Oczekiwane: FAIL — brak `App`, `renderWithProviders` i tras.

- [ ] **Krok 6: Zaimplementuj `App.tsx`, `AppShell`, `Sidebar`, `TopBar`, szkielet `renderWithProviders` i `test/setup.ts`.**

`App.tsx` używa `createBrowserRouter` z trasami `/`, `/leases`, `/appeals`, `/baseline`, `/graph`, `/audit` pod layoutem `AppShell` oraz trasą `*` przekierowującą na `/`. Każda strona renderuje `<h1>` z nazwą widoku i nic więcej (placeholdery do zadania 3+). `renderWithProviders` tworzy świeży `QueryClient` z `retry: false` i owija w `QueryClientProvider` + `MemoryRouter` z `initialEntries: [options?.route ?? '/']`. `test/setup.ts` importuje `@testing-library/jest-dom/vitest`, uruchamia `server.listen()` w `beforeAll`, `server.resetHandlers()` w `afterEach`, `server.close()` w `afterAll`.

- [ ] **Krok 7: Uruchom ponownie test, build i lint.**

Run: `cd frontend && npm test -- --run src/App.test.tsx && npm run build && npm run lint`
Oczekiwane: test PASS, build i lint kończą się kodem 0.

- [ ] **Krok 8: Zaktualizuj drzewo katalogów w `CODING_STANDARDS.md`** (dodaj `api/`, `pages/`, `test/` do struktury frontendu).

- [ ] **Krok 9: Commit.**

```bash
git add frontend CODING_STANDARDS.md
git commit -m "feat(frontend): scaffold SPA shell with dark theme, routing and test setup"
```

---

### Zadanie 2 (PR 5.2): Kontrakt DTO, `lib/dateTime.ts` i `lib/statusBadges.ts`

**Pliki:**
- Utwórz: `frontend/src/types/api.ts` (pełny kontrakt ze spec §5)
- Utwórz: `frontend/src/lib/dateTime.ts`, `frontend/src/lib/statusBadges.ts`
- Test: `frontend/src/lib/dateTime.test.ts`, `frontend/src/lib/statusBadges.test.ts`

**Interfejsy:**
- Produkuje: `DAY_MS`, `WARNING_WINDOW_DAYS = 7`, `DISPLAY_TIME_ZONE = 'Europe/Warsaw'`; `daysRemaining(expires_at: string, simulated_now: string): number`; `leaseStatus(expires_at: string, simulated_now: string): LeaseStatus`; `formatDateTimePl(iso: string): string`; `formatDaysRemaining(expires_at: string, simulated_now: string): string`; `formatOffsetDays(offset_days: number): string`; `getStatusBadge(status: LeaseStatus): { label: string; className: string }`; `getRoleLabel(role: Role): string`; `getRecommendedActionLabel(action: RecommendedAction): string`; `getAppealStatusBadge(status: AppealStatus): { label: string; className: string }`.
- Konsumuje: nic poza typami.

- [ ] **Krok 1: Napisz failing testy `leaseStatus` na granicach.**

```ts
const now = '2026-10-03T12:00:00Z';

it.each([
  ['2026-10-11T12:00:00Z', 'ACTIVE'],   // 8 dni
  ['2026-10-10T13:00:00Z', 'WARNING'],  // 7 dni + 1 h
  ['2026-10-10T12:00:00Z', 'WARNING'],  // dokładnie 7 dni
  ['2026-10-04T12:00:00Z', 'WARNING'],  // 1 dzień
  ['2026-10-03T12:00:00Z', 'EXPIRED'],  // dokładnie 0
  ['2026-09-30T12:00:00Z', 'EXPIRED'],  // przeszłość
])('leaseStatus(%s) === %s', (expiresAt, expected) => {
  expect(leaseStatus(expiresAt, now)).toBe(expected);
});
```

- [ ] **Krok 2: Napisz failing testy `daysRemaining` i formatowania.**

```ts
it('rounds partial days up and allows negative values', () => {
  expect(daysRemaining('2026-10-10T12:00:00Z', now)).toBe(7);
  expect(daysRemaining('2026-10-10T00:00:00Z', now)).toBe(7); // 6,5 dnia
  expect(daysRemaining('2026-09-30T12:00:00Z', now)).toBe(-3);
});

it.each([
  ['2026-10-15T12:00:00Z', 'Pozostało 12 dni'],
  ['2026-10-04T12:00:00Z', 'Pozostało 1 dzień'],
  ['2026-10-03T12:00:00Z', 'Wygasa dziś'],
  ['2026-10-02T12:00:00Z', 'Wygasła 1 dzień temu'],
  ['2026-09-30T12:00:00Z', 'Wygasła 3 dni temu'],
])('formatDaysRemaining(%s)', (expiresAt, expected) => {
  expect(formatDaysRemaining(expiresAt, now)).toBe(expected);
});

it('formats dates in a fixed display time zone', () => {
  expect(formatDateTimePl('2026-10-03T13:24:00Z')).toBe('3 października 2026, 15:24');
  expect(formatOffsetDays(15)).toBe('+15 dni');
  expect(formatOffsetDays(-15)).toBe('−15 dni');
});
```

- [ ] **Krok 3: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/lib/dateTime.test.ts`
Oczekiwane: FAIL — moduł nie istnieje.

- [ ] **Krok 4: Zaimplementuj `types/api.ts` (kontrakt ze spec §5) oraz `lib/dateTime.ts`.**

`leaseStatus` liczy `diff = Date.parse(expires_at) - Date.parse(simulated_now)`: `diff <= 0` → `EXPIRED`, `diff <= WARNING_WINDOW_DAYS * DAY_MS` → `WARNING`, inaczej `ACTIVE`. `formatDateTimePl` używa `Intl.DateTimeFormat('pl-PL', { timeZone: DISPLAY_TIME_ZONE, dateStyle: 'long', timeStyle: 'short' })`. `formatOffsetDays` używa znaku `−` (U+2212) dla wartości ujemnych.

- [ ] **Krok 5: Uruchom testy `dateTime` i potwierdź PASS.**

Run: `cd frontend && npm test -- --run src/lib/dateTime.test.ts`
Oczekiwane: PASS.

- [ ] **Krok 6: Napisz failing testy `statusBadges`.**

```ts
it('maps every status to a distinct Polish label and class', () => {
  const badges = (['ACTIVE', 'WARNING', 'EXPIRED'] as const).map(getStatusBadge);
  expect(badges.map((b) => b.label)).toEqual(['Aktywna', 'Wygasa wkrótce', 'Wygasła']);
  expect(new Set(badges.map((b) => b.className)).size).toBe(3);
});

it('maps roles and recommendations to labels', () => {
  expect(['admin', 'write', 'read'].map(getRoleLabel)).toEqual(['Administrator', 'Zapis (write)', 'Odczyt (read)']);
  expect(getRecommendedActionLabel('downscope')).toBe('Zdeeskaluj');
  expect(getRecommendedActionLabel('revoke')).toBe('Odbierz');
  expect(getRecommendedActionLabel(null)).toBe('');
});

it('maps appeal statuses to Polish labels', () => {
  const labels = (['PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => getAppealStatusBadge(status).label);
  expect(labels).toEqual(['Oczekujące', 'Zatwierdzone', 'Odrzucone']);
});
```

- [ ] **Krok 7: Zaimplementuj `lib/statusBadges.ts`, uruchom testy i potwierdź PASS.**

Run: `cd frontend && npm test -- --run src/lib/statusBadges.test.ts && npm run build`
Oczekiwane: PASS, build bez błędów.

- [ ] **Krok 8: Commit.**

```bash
git add frontend/src/types frontend/src/lib
git commit -m "feat(frontend): add API contract types and single sources of truth for time and badges"
```

---

### Zadanie 3 (PR 5.3): Fixture'y, tabela dzierżaw i strona Dzierżawy

**Pliki:**
- Utwórz: `frontend/src/api/config.ts`, `frontend/src/api/fixtures/{leases.json,clock.json,index.ts}`
- Utwórz: `frontend/src/api/leases.ts`, `frontend/src/api/simulation.ts`, `frontend/src/hooks/useLeases.ts`, `frontend/src/hooks/useSimulatedClock.ts`
- Utwórz: `frontend/src/components/leases/LeaseTable.tsx`, `frontend/src/components/leases/LeaseStatusBadge.tsx`
- Zmień: `frontend/src/pages/LeasesPage.tsx`
- Test: `frontend/src/pages/LeasesPage.test.tsx`

**Interfejsy:**
- Produkuje: `shouldUseFixtures(): boolean` (`api/config.ts`, czyta `VITE_USE_FIXTURES` przy każdym wywołaniu); `fetchLeases(): Promise<LeaseListResponse>`; `fetchClock(): Promise<SimulatedClock>`; `useLeases(): UseQueryResult<LeaseListResponse>`; `useSimulatedClock(): UseQueryResult<SimulatedClock>`; `LeaseTable({ leases, simulatedNow }: LeaseTableProps): React.JSX.Element`; `LeaseStatusBadge({ status }: { status: LeaseStatus }): React.JSX.Element`; typowany re-export fixture'ów `leasesFixture`, `clockFixture` z `api/fixtures/index.ts`.
- Konsumuje: `leaseStatus`, `daysRemaining`, `formatDaysRemaining`, `formatDateTimePl` (zadanie 2), `getStatusBadge`, `getRoleLabel`, `getRecommendedActionLabel` (zadanie 2).

- [ ] **Krok 1: Utwórz fixture'y zgodne z kontraktem.**

`clock.json`: `{"simulated_now": "2026-10-03T12:00:00Z", "offset_days": 0}`. `leases.json` — cztery dzierżawy o stabilnych identyfikatorach, na których opierają się kolejne zadania i test integracyjny: `id: 1` kamil/DEV/`write`/2026-11-02 (`ACTIVE`), `id: 2` marta/QA/`read`/2026-10-08 (`WARNING`, 5 dni), `id: 3` piotr/DEV/`write`/2026-09-30 (`EXPIRED`), `id: 4` tomasz-admin/DEV/`admin`/2027-01-01 z `recommended_action: "downscope"`. `last_activity` wypełnione dla trzech, `null` dla jednej. `index.ts` re-eksportuje je z typem: `export const leasesFixture: LeaseListResponse = leasesJson;`.

- [ ] **Krok 2: Napisz failing test `renders_lease_rows_sorted_by_urgency`.**

```tsx
renderWithProviders(<LeasesPage />);

const rows = await screen.findAllByRole('row');
expect(rows).toHaveLength(5); // nagłówek + 4 dzierżawy
expect(within(rows[1]).getByText('Wygasła')).toBeInTheDocument();   // EXPIRED pierwszy
expect(within(rows[2]).getByText('Wygasa wkrótce')).toBeInTheDocument();
expect(within(rows[2]).getByText('Pozostało 5 dni')).toBeInTheDocument();
expect(within(rows[4]).getByText('Aktywna')).toBeInTheDocument();
```

- [ ] **Krok 3: Napisz failing test stanu pustego `renders_empty_state_where_there_are_no_leases`.**

```tsx
renderWithProviders(<LeaseTable leases={[]} simulatedNow={clockFixture.simulated_now} />);
expect(screen.getByText('Brak dzierżaw do wyświetlenia')).toBeInTheDocument();
```
Stan pusty na poziomie całej strony jest sprawdzany w zadaniu 4, gdy odczyty przechodzą już przez MSW.

- [ ] **Krok 4: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/pages/LeasesPage.test.tsx`
Oczekiwane: FAIL — brak strony, tabeli i hooków.

- [ ] **Krok 5: Zaimplementuj `config.ts`, fixture'y, `api/leases.ts`, `api/simulation.ts` i hooki.**

`api/config.ts`: `export function shouldUseFixtures(): boolean { return import.meta.env.VITE_USE_FIXTURES === 'true'; }` — funkcja, nie stała, żeby `vi.stubEnv` działało w testach. W tym zadaniu `fetchLeases` i `fetchClock` zwracają fixture'y bezwarunkowo (podpięcie na żywo w zadaniu 4). Hooki: `useQuery({ queryKey: ['leases'], queryFn: fetchLeases })` i `queryKey: ['clock']`.

- [ ] **Krok 6: Zaimplementuj `LeaseStatusBadge` i `LeaseTable`.**

Kolumny: Użytkownik, Zespół, Repozytorium, Poziom (`getRoleLabel`), Ostatnia aktywność (`formatDateTimePl` albo `—`), Pozostało (`formatDaysRemaining`), Status (`LeaseStatusBadge`). Sortowanie: ranga statusu `EXPIRED → WARNING → ACTIVE`, potem rosnąco po `daysRemaining`. Kolumny tekstowe mają `max-w-*` i `break-words`, żeby długie loginy i nazwy repozytoriów nie rozsadzały tabeli. Kolumna akcji pojawi się w zadaniu 7 — wtedy `LeaseTable` dostanie prop `onDecide`.

- [ ] **Krok 7: Zaimplementuj `LeasesPage`** (nagłówek `<h1>Dzierżawy</h1>`, stany: Skeleton podczas ładowania, komunikat błędu z przyciskiem „Odśwież" wywołującym `refetch`, pusty stan).

- [ ] **Krok 8: Uruchom testy, build i lint.**

Run: `cd frontend && npm test -- --run src/pages/LeasesPage.test.tsx && npm run build && npm run lint`
Oczekiwane: PASS, build i lint zielone.

- [ ] **Krok 9: Commit.**

```bash
git add frontend/src
git commit -m "feat(frontend): render lease inventory from contract fixtures"
```

---

### Zadanie 4 (PR 5.4a): Klient HTTP, flaga fixture'ów i odczyty na żywo przez MSW

**Pliki:**
- Utwórz: `frontend/src/api/client.ts`
- Utwórz: `frontend/src/test/msw/state.ts`
- Zmień: `frontend/src/api/leases.ts`, `frontend/src/api/simulation.ts`, `frontend/src/test/msw/handlers.ts`, `frontend/src/test/setup.ts`
- Test: `frontend/src/api/client.test.ts`, `frontend/src/pages/LeasesPage.test.tsx` (rozszerzenie)

**Interfejsy:**
- Produkuje: `class ApiError extends Error { status: number }`; `getJson<T>(path: string): Promise<T>`; `postJson<TResponse, TBody>(path: string, body: TBody): Promise<TResponse>`; `resetMswState(): void`; `getSimulatedNow(): string`; `setSimulatedNow(iso: string): void` z `test/msw/state.ts`.
- Konsumuje: istniejące `fetchLeases` / `fetchClock` (podmieniane ciałem, bez zmian sygnatur).

- [ ] **Krok 1: Utwórz `test/msw/state.ts` i handlery dla dzierżaw oraz zegara.**

```ts
let simulatedNow = '2026-10-03T12:00:00Z';
export function getSimulatedNow(): string { return simulatedNow; }
export function setSimulatedNow(iso: string): void { simulatedNow = iso; }
export function resetMswState(): void { simulatedNow = '2026-10-03T12:00:00Z'; }
```
`handlers.ts` eksportuje `handlers: HttpHandler[]` z `http.get('/api/v1/leases', () => HttpResponse.json(leasesFixture))` i `http.get('/api/v1/simulation/clock', () => HttpResponse.json({ simulated_now: getSimulatedNow(), offset_days: 0 }))`. W `test/setup.ts` dodaj `resetMswState()` w `beforeEach`.

- [ ] **Krok 2: Napisz failing testy `client`.**

```ts
it('normalizes FastAPI detail errors', async () => {
  server.use(http.post('/api/v1/leases/1/decision', () => HttpResponse.json({ detail: 'Boom' }, { status: 500 })));
  await expect(postJson('/api/v1/leases/1/decision', {})).rejects.toMatchObject({ status: 500, message: 'Boom' });
});

it('normalizes GitHub-style message errors', async () => {
  server.use(http.post('/api/v1/leases/1/decision', () =>
    HttpResponse.json({ message: 'Cannot remove the last administrator', documentation_url: 'https://docs' }, { status: 403 })));
  const error = await postJson('/api/v1/leases/1/decision', {}).catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(403);
  expect(error.message).toBe('Cannot remove the last administrator');
});
```

- [ ] **Krok 3: Napisz failing test trybu fixture'ów i trybu live.**

```ts
it('serves fixtures when VITE_USE_FIXTURES is true', async () => {
  vi.stubEnv('VITE_USE_FIXTURES', 'true');
  const response = await fetchLeases();
  expect(response.leases).toHaveLength(4);
  vi.unstubAllEnvs();
});

it('fetches live data when VITE_USE_FIXTURES is not set', async () => {
  const response = await fetchLeases();
  expect(response.leases[0].user.login).toBe(leasesFixture.leases[0].user.login);
});

it('renders the page-level empty state through MSW', async () => {
  server.use(http.get('/api/v1/leases', () => HttpResponse.json({ leases: [] })));
  renderWithProviders(<LeasesPage />);
  expect(await screen.findByText('Brak dzierżaw do wyświetlenia')).toBeInTheDocument();
});
```

- [ ] **Krok 4: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/api/client.test.ts`
Oczekiwane: FAIL — brak `client.ts`, brak handlerów.

- [ ] **Krok 5: Zaimplementuj `client.ts` i podłącz flagę w `api/*`.**

`client.ts` używa `fetch` z relatywnymi ścieżkami (`/api/v1/...`), parsuje JSON i przy `!response.ok` rzuca `ApiError` z komunikatem z `detail` (FastAPI) lub `message` (GitHub), a gdy brak obu — `Request failed with status ${status}`. W `api/leases.ts` i `api/simulation.ts`: `if (shouldUseFixtures()) return <fixture>;` na początku funkcji, dalej `getJson('/api/v1/...')`.

- [ ] **Krok 6: Uruchom pełny zestaw testów i potwierdź PASS.**

Run: `cd frontend && npm test -- --run && npm run build`
Oczekiwane: PASS (testy tabeli przechodzą teraz przez MSW), build zielony.

- [ ] **Krok 7: Commit.**

```bash
git add frontend/src
git commit -m "feat(frontend): add typed API client with fixture fallback flag"
```

---

### Zadanie 5 (PR 5.4b): Zegar symulowany i pasek czasu

**Pliki:**
- Zmień: `frontend/src/api/simulation.ts` (dodaj `postTimeTravel`), `frontend/src/test/msw/handlers.ts`, `frontend/src/test/msw/state.ts`
- Utwórz: `frontend/src/hooks/useTimeTravel.ts`, `frontend/src/components/layout/TimeTravelBar.tsx`
- Zmień: `frontend/src/components/layout/TopBar.tsx` (montuje `TimeTravelBar`)
- Test: `frontend/src/components/layout/TimeTravelBar.test.tsx`

**Interfejsy:**
- Produkuje: `postTimeTravel(request: TimeTravelRequest): Promise<SimulatedClock>`; `useTimeTravel(): UseMutationResult<SimulatedClock, Error, TimeTravelRequest>`; `getLastTimeTravelRequest(): TimeTravelRequest | null`; `TimeTravelBar(): React.JSX.Element`.
- Konsumuje: `useSimulatedClock`, `formatDateTimePl`, `formatOffsetDays` (zadania 2–3), `resetMswState`/`setSimulatedNow` (zadanie 4).

- [ ] **Krok 1: Rozszerz stan i handlery MSW o podróż w czasie.**

`state.ts` przechowuje `lastTimeTravelRequest`. Handler `http.post('/api/v1/simulation/time-travel', async ({ request }) => { const body = await request.json(); ... })`: dla `{ reset: true }` ustawia `2026-10-03T12:00:00Z` i `offset_days: 0`; dla `{ days }` przesuwa `simulatedNow` o `days` dni i zwraca `{ simulated_now, offset_days }`.

- [ ] **Krok 2: Napisz failing testy paska czasu.**

```tsx
it('shows the simulated clock and advances it by 15 days', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);

  expect(await screen.findByText(/3 października 2026/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '+15 dni' }));

  await waitFor(() => expect(getLastTimeTravelRequest()).toEqual({ days: 15 }));
  expect(await screen.findByText(/18 października 2026/)).toBeInTheDocument();
});

it('accepts a custom number of days and resets the clock', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);
  await user.type(screen.getByLabelText('Własna liczba dni'), '25');
  await user.click(screen.getByRole('button', { name: 'Przesuń' }));
  await waitFor(() => expect(getLastTimeTravelRequest()).toEqual({ days: 25 }));

  await user.click(screen.getByRole('button', { name: 'Reset' }));
  await waitFor(() => expect(getLastTimeTravelRequest()).toEqual({ reset: true }));
});

it.each(['0', '-5', 'abc'])('rejects invalid custom input %s', async (value) => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);
  await user.type(screen.getByLabelText('Własna liczba dni'), value);
  await user.click(screen.getByRole('button', { name: 'Przesuń' }));

  expect(await screen.findByText('Podaj dodatnią liczbę dni')).toBeInTheDocument();
  expect(getLastTimeTravelRequest()).toBeNull();
});
```

- [ ] **Krok 3: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/components/layout/TimeTravelBar.test.tsx`
Oczekiwane: FAIL — brak komponentu, brak handlera.

- [ ] **Krok 4: Zaimplementuj `postTimeTravel`, `useTimeTravel` i `TimeTravelBar`.**

`useTimeTravel` w `onSuccess` wywołuje `queryClient.invalidateQueries()` (cały cache) i pokazuje toast `Zmieniono czas symulowany`. `TimeTravelBar` pokazuje `formatDateTimePl(simulated_now)` i `Przesunięcie: {formatOffsetDays(offset_days)}`, przyciski `+15 dni`, `+30 dni`, `+60 dni`, pole `Własna liczba dni` (walidacja: liczba całkowita > 0; komunikat `Podaj dodatnią liczbę dni`), przycisk `Przesuń` i `Reset`. Wszystkie przyciski `disabled` gdy mutacja jest w toku; po sukcesie pole własnej liczby dni jest czyszczone (test integracyjny wykonuje dwa skoki pod rząd).

- [ ] **Krok 5: Zamontuj `TimeTravelBar` w `TopBar` i uruchom testy.**

Run: `cd frontend && npm test -- --run && npm run build && npm run lint`
Oczekiwane: PASS, build i lint zielone.

- [ ] **Krok 6: Commit.**

```bash
git add frontend/src
git commit -m "feat(frontend): add simulated clock bar with time travel controls"
```

---

### Zadanie 6 (PR 5.5a): Decyzja o dzierżawie — API i obsługa błędów

**Pliki:**
- Zmień: `frontend/src/api/leases.ts` (dodaj `postLeaseDecision`), `frontend/src/test/msw/handlers.ts`, `frontend/src/test/msw/state.ts`
- Utwórz: `frontend/src/hooks/useLeaseDecision.ts`
- Test: `frontend/src/api/leases.test.ts`

**Interfejsy:**
- Produkuje: `postLeaseDecision(lease_id: number, request: LeaseDecisionRequest): Promise<Lease>`; `useLeaseDecision(): UseMutationResult<Lease, Error, { lease_id: number; request: LeaseDecisionRequest }>`; `getLastDecisionRequest(): { lease_id: number; request: LeaseDecisionRequest } | null`.
- Konsumuje: `postJson`, `ApiError` (zadanie 4).

- [ ] **Krok 1: Napisz failing testy payloadów decyzji.**

```ts
it.each([
  [{ action: 'extend', days: 30 }, 'preset'],
  [{ action: 'extend', multiplier: 2 }, 'multiplier'],
  [{ action: 'extend', date: '2026-12-01' }, 'date'],
  [{ action: 'revoke' }, 'revoke'],
  [{ action: 'downscope' }, 'downscope'],
])('posts %o decision', async (request) => {
  await postLeaseDecision(3, request as LeaseDecisionRequest);
  expect(getLastDecisionRequest()).toMatchObject({ lease_id: 3, request });
});
```

- [ ] **Krok 2: Napisz failing test ścieżki `403` ostatniego administratora.**

```ts
it('surfaces the last-admin 403 as ApiError', async () => {
  const error = await postLeaseDecision(4, { action: 'revoke' }).catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(403);
});
```

- [ ] **Krok 3: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/api/leases.test.ts`
Oczekiwane: FAIL — brak `postLeaseDecision` i handlera.

- [ ] **Krok 4: Zaimplementuj handler decyzji w MSW (z przypadkiem 403 dla dzierżawy `admin`) oraz `postLeaseDecision`.**

Handler zapisuje żądanie w stanie, aktualizuje kopię fixture'ów (dla `extend` przesuwa `expires_at`), dla `lease_id` z rolą `admin` i akcji `revoke` zwraca `403` z ciałem `{ message: 'Cannot remove the last administrator of the repository/organization', documentation_url: '...' }`.

- [ ] **Krok 5: Zaimplementuj `useLeaseDecision`** z inwalidacją `['leases']`, `['dashboard']`, `['audit']`, `['appeals']`, `['graph']` po sukcesie.

- [ ] **Krok 6: Uruchom testy i potwierdź PASS.**

Run: `cd frontend && npm test -- --run src/api/leases.test.ts && npm run build`
Oczekiwane: PASS.

- [ ] **Krok 7: Commit.**

```bash
git add frontend/src
git commit -m "feat(frontend): add lease decision API with last-admin error path"
```

---

### Zadanie 7 (PR 5.5b): Modal decyzji i akcje w tabeli

**Pliki:**
- Utwórz: `frontend/src/components/leases/DecisionModal.tsx`
- Zmień: `frontend/src/components/leases/LeaseTable.tsx` (przycisk `Decyzja` w wierszu), `frontend/src/pages/LeasesPage.tsx` (stan otwartego modala)
- Test: `frontend/src/components/leases/DecisionModal.test.tsx`

**Interfejsy:**
- Produkuje: `DecisionModal({ lease, simulatedNow, open, onOpenChange }: DecisionModalProps): React.JSX.Element` (kontekst odwołania dochodzi w zadaniu 11).
- Konsumuje: `useLeaseDecision` (zadanie 6), `getRoleLabel`, `getStatusBadge` (zadanie 2), `formatDaysRemaining` (zadanie 2).

- [ ] **Krok 1: Napisz failing testy wyboru opcji przedłużenia.**

W testach korzystaj z re-eksportów fixture'ów: `const now = clockFixture.simulated_now; const activeLease = leasesFixture.leases[0]; const adminLease = leasesFixture.leases[3];`.

```tsx
it.each([
  ['+30 dni', { action: 'extend', days: 30 }],
  ['2x', { action: 'extend', multiplier: 2 }],
])('sends %s as %o', async (label, expected) => {
  const user = userEvent.setup();
  renderWithProviders(<DecisionModal lease={activeLease} simulatedNow={now} open onOpenChange={() => {}} />);

  await user.click(screen.getByRole('button', { name: label }));
  await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));

  await waitFor(() => expect(getLastDecisionRequest()).toMatchObject({ request: expected }));
  expect(await screen.findByText('Decyzja zapisana')).toBeInTheDocument();
});

it('rejects a date in the past without calling the API', async () => {
  const user = userEvent.setup();
  renderWithProviders(<DecisionModal lease={activeLease} simulatedNow={now} open onOpenChange={() => {}} />);

  await user.click(screen.getByRole('button', { name: 'Data' }));
  await user.type(screen.getByLabelText('Data wygaśnięcia'), '2026-09-01');
  await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));

  expect(await screen.findByText('Data musi być późniejsza niż czas symulowany')).toBeInTheDocument();
  expect(getLastDecisionRequest()).toBeNull();
});
```

- [ ] **Krok 2: Napisz failing test ścieżki last-admin i potwierdzenia wyłączenia.**

```tsx
it('shows the protection message on 403', async () => {
  const user = userEvent.setup();
  renderWithProviders(<DecisionModal lease={adminLease} simulatedNow={now} open onOpenChange={() => {}} />);

  await user.click(screen.getByRole('button', { name: 'Wyłącz' }));
  await user.click(screen.getByRole('button', { name: 'Potwierdzam wyłączenie' }));

  expect(await screen.findByText('Nie można odebrać uprawnień ostatniemu administratorowi.')).toBeInTheDocument();
});
```

- [ ] **Krok 3: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/components/leases/DecisionModal.test.tsx`
Oczekiwane: FAIL — brak komponentu.

- [ ] **Krok 4: Zaimplementuj `DecisionModal` i podłącz akcję w tabeli.**

Modal (shadcn `Dialog`) pokazuje kontekst (użytkownik, repozytorium, rola, status, „pozostało") i sekcje: **Przedłuż** (presety `+7 / +14 / +30 / +90`, mnożniki `1,5x / 2x`, pole własnej liczby dni, przycisk `Data` z kalendarzem), **Wyłącz** (przycisk `Wyłącz` → potwierdzenie `Potwierdzam wyłączenie`), **Zdeeskaluj** (widoczny tylko dla `role === 'write'` lub `'admin'`). Sukces: toast `Decyzja zapisana`, zamknięcie modala. Błąd `403`: stały komunikat `Nie można odebrać uprawnień ostatniemu administratorowi.`; inny błąd: `error.message`. W `LeaseTable` dodaj kolumnę akcji z przyciskiem `Decyzja`; `LeasesPage` trzyma `selectedLease` w stanie lokalnym.

- [ ] **Krok 5: Uruchom testy, build i lint.**

Run: `cd frontend && npm test -- --run && npm run build && npm run lint`
Oczekiwane: PASS, zielone.

- [ ] **Krok 6: Commit.**

```bash
git add frontend/src
git commit -m "feat(frontend): add decision modal with extend, revoke and downscope"
```

---

### Zadanie 8 (PR 5.6): Dashboard z licznikami (linia cięcia)

**Pliki:**
- Utwórz: `frontend/src/api/dashboard.ts`, `frontend/src/api/fixtures/dashboard.json`, `frontend/src/hooks/useDashboard.ts`, `frontend/src/components/dashboard/KpiCard.tsx`
- Zmień: `frontend/src/pages/DashboardPage.tsx`, `frontend/src/api/fixtures/index.ts`, `frontend/src/test/msw/handlers.ts`
- Test: `frontend/src/pages/DashboardPage.test.tsx`

**Interfejsy:**
- Produkuje: `fetchDashboard(): Promise<DashboardCounters>`; `useDashboard(): UseQueryResult<DashboardCounters>`; `KpiCard({ label, value, tone }: KpiCardProps): React.JSX.Element`.
- Konsumuje: `getStatusBadge` dla tonacji kart (zadanie 2).

- [ ] **Krok 1: Napisz failing test liczników.**

```tsx
it('renders the four KPI counters', async () => {
  renderWithProviders(<DashboardPage />);

  expect(await screen.findByText('Aktywne dzierżawy')).toBeInTheDocument();
  expect(screen.getByText('Ostrzeżenia')).toBeInTheDocument();
  expect(screen.getByText('Wygaśnięte')).toBeInTheDocument();
  expect(screen.getByText('Rekomendacje deeskalacji')).toBeInTheDocument();
  expect(screen.getByTestId('kpi-active')).toHaveTextContent('12');
});
```

- [ ] **Krok 2: Napisz failing testy stanu zerowego i błędu.**

```tsx
it('renders zeros when the API returns empty counters', async () => {
  server.use(http.get('/api/v1/dashboard', () => HttpResponse.json({
    active: 0, warning: 0, expired: 0, downscope_recommendations: 0,
  })));
  renderWithProviders(<DashboardPage />);
  expect(await screen.findByTestId('kpi-warning')).toHaveTextContent('0');
});

it('shows an error state with retry when the API fails', async () => {
  server.use(http.get('/api/v1/dashboard', () => HttpResponse.json({ detail: 'Boom' }, { status: 500 })));
  renderWithProviders(<DashboardPage />);
  expect(await screen.findByText('Nie udało się pobrać liczników')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Odśwież' })).toBeInTheDocument();
});
```

- [ ] **Krok 3: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/pages/DashboardPage.test.tsx`
Oczekiwane: FAIL — brak API, hooka i kart.

- [ ] **Krok 4: Zaimplementuj `fetchDashboard`, fixture, hook, `KpiCard` i `DashboardPage`.**

Fixture `dashboard.json` (spójny z testem integracyjnym): `{ "active": 12, "warning": 1, "expired": 1, "downscope_recommendations": 1 }`. Cztery karty w siatce, `data-testid` w formacie `kpi-{active|warning|expired|downscope}`. `DashboardPage` obsługuje Skeleton, błąd z przyciskiem `Odśwież` (`refetch`) i wartości zerowe.

- [ ] **Krok 5: Uruchom pełny zestaw testów, build i lint — to jest linia cięcia.**

Run: `cd frontend && npm test -- --run && npm run build && npm run lint`
Oczekiwane: PASS, zielone. Ręcznie: `npm run dev` + backend → dashboard, tabela, pasek czasu i modal działają (UC-2, UC-4, UC-5).

- [ ] **Krok 6: Commit.**

```bash
git add frontend/src
git commit -m "feat(frontend): add dashboard KPI counters from API"
```

---

### Zadanie 9 (PR 5.7): Standard zespołu i onboarding (UC-1)

**Pliki:**
- Utwórz: `frontend/src/api/baseline.ts`, `frontend/src/api/fixtures/baseline.json`, `frontend/src/hooks/useBaseline.ts`, `frontend/src/hooks/useApproveBaseline.ts`, `frontend/src/components/baseline/BaselineTable.tsx`, `frontend/src/components/baseline/BaselineApproval.tsx`
- Zmień: `frontend/src/pages/BaselinePage.tsx`, `frontend/src/api/fixtures/index.ts`, `frontend/src/test/msw/handlers.ts`
- Test: `frontend/src/pages/BaselinePage.test.tsx`

**Interfejsy:**
- Produkuje: `fetchBaseline(team_id: string): Promise<BaselineResponse>`; `postApproveBaseline(team_id: string, user_login: string): Promise<void>`; `useBaseline(team_id: string)`, `useApproveBaseline()`; `BaselineTable({ response }: { response: BaselineResponse }): React.JSX.Element`; `BaselineApproval({ teamId, members, onApprove }: BaselineApprovalProps): React.JSX.Element`; `getLastBaselineApproval(): { team_id: string; body: { user_login: string } } | null`.
- Konsumuje: `getRoleLabel` (zadanie 2).

- [ ] **Krok 1: Napisz failing test widoku DEV i QA oraz zakazu `admin`.**

```tsx
it('renders baseline entries for both teams and never proposes admin', async () => {
  renderWithProviders(<BaselinePage />);

  expect(await screen.findByRole('heading', { name: 'Zespół DEV' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Zespół QA' })).toBeInTheDocument();
  expect(screen.getAllByText('Zapis (write)').length).toBeGreaterThan(0);
  expect(screen.queryByText('Administrator')).not.toBeInTheDocument();
});
```

- [ ] **Krok 2: Napisz failing test zatwierdzenia standardu.**

```tsx
it('approves the team standard for the selected new member', async () => {
  const user = userEvent.setup();
  renderWithProviders(<BaselinePage />);

  await user.click(await screen.findByRole('button', { name: 'Zatwierdź standard' }));
  await waitFor(() => expect(getLastBaselineApproval()).toMatchObject({
    team_id: 'DEV', body: { user_login: 'nowy-dev' },
  }));
  expect(await screen.findByText('Standard zatwierdzony')).toBeInTheDocument();
});
```

- [ ] **Krok 3: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/pages/BaselinePage.test.tsx`
Oczekiwane: FAIL — brak widoku i API.

- [ ] **Krok 4: Zaimplementuj API, fixture'y (DEV i QA, w tym członek bez dostępów), hooki i komponenty.**

Ścieżka zatwierdzenia: `POST /api/v1/baseline/{team_id}/approve` z ciałem `{ user_login }` — **do potwierdzenia w 4.2**; jeśli backend zwróci inną ścieżkę, zmiana wyłącznie w `api/baseline.ts`. `BaselineTable` pokazuje repozytorium, proponowaną rolę i udział aktywnych członków (`active_members / team_size`). `BaselineApproval` wybiera nowego członka z listy i wysyła zatwierdzenie; błąd pokazuje `error.message`.

- [ ] **Krok 5: Uruchom testy, build i lint.**

Run: `cd frontend && npm test -- --run && npm run build && npm run lint`
Oczekiwane: PASS, zielone.

- [ ] **Krok 6: Commit.**

```bash
git add frontend/src
git commit -m "feat(frontend): add team baseline view with one-click onboarding"
```

---

### Zadanie 10 (PR 5.8a): Odwołania — API i formularz (UC-3)

**Pliki:**
- Utwórz: `frontend/src/api/appeals.ts`, `frontend/src/api/fixtures/appeals.json`, `frontend/src/hooks/useAppeals.ts`, `frontend/src/hooks/useSubmitAppeal.ts`, `frontend/src/components/appeals/AppealForm.tsx`
- Zmień: `frontend/src/pages/AppealsPage.tsx`, `frontend/src/api/fixtures/index.ts`, `frontend/src/test/msw/handlers.ts`
- Test: `frontend/src/pages/AppealsPage.test.tsx`

**Interfejsy:**
- Produkuje: `fetchAppeals(): Promise<{ appeals: Appeal[] }>`; `postAppeal(lease_id: number, justification: string): Promise<Appeal>`; `useAppeals()`, `useSubmitAppeal()`; `AppealForm({ leases, onSubmit }: AppealFormProps): React.JSX.Element`; `getLastAppealRequest(): { lease_id: number; justification: string } | null`.
- Konsumuje: `useLeases` (zadanie 3), `postJson`/`ApiError` (zadanie 4).

- [ ] **Krok 1: Napisz failing test walidacji uzasadnienia.**

```tsx
it('requires a justification and does not call the API when empty', async () => {
  const user = userEvent.setup();
  renderWithProviders(<AppealsPage />);

  await user.selectOptions(await screen.findByLabelText('Dzierżawa'), '2');
  await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

  expect(await screen.findByText('Uzasadnienie jest wymagane')).toBeInTheDocument();
  expect(getLastAppealRequest()).toBeNull();
});
```

- [ ] **Krok 2: Napisz failing testy wysyłki i duplikatu.**

```tsx
it('submits a justification and refreshes the list', async () => {
  const user = userEvent.setup();
  renderWithProviders(<AppealsPage />);

  await user.selectOptions(await screen.findByLabelText('Dzierżawa'), '2');
  await user.type(screen.getByLabelText('Uzasadnienie'), 'Prowadzę release v2.1 w przyszłym tygodniu');
  await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

  await waitFor(() => expect(getLastAppealRequest()).toMatchObject({ lease_id: 2 }));
  expect(await screen.findByText('Odwołanie złożone')).toBeInTheDocument();
});

it('shows the API error when the justification is a duplicate', async () => {
  server.use(http.post('/api/v1/appeals', () =>
    HttpResponse.json({ detail: 'Justification already used' }, { status: 409 })));
  const user = userEvent.setup();
  renderWithProviders(<AppealsPage />);

  await user.selectOptions(await screen.findByLabelText('Dzierżawa'), '2');
  await user.type(screen.getByLabelText('Uzasadnienie'), 'To samo uzasadnienie');
  await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

  expect(await screen.findByText('Justification already used')).toBeInTheDocument();
});
```

- [ ] **Krok 3: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/pages/AppealsPage.test.tsx`
Oczekiwane: FAIL — brak widoku, formularza i API.

- [ ] **Krok 4: Zaimplementuj API, fixture'y, hooki, `AppealForm` i stronę.**

`AppealsPage` pokazuje listę dzierżaw w `WARNING`/`EXPIRED` (z `useLeases`), formularz odwołania oraz listę złożonych odwołań ze statusem; pozycja `PENDING` ma przycisk `Rozpatrz`, który otwiera modal decyzji (kontekst odwołania dochodzi w zadaniu 11). Uzasadnienie: `trim()` niepuste, w przeciwnym razie komunikat `Uzasadnienie jest wymagane` i brak żądania. Po sukcesie: toast `Odwołanie złożone` i inwalidacja `['appeals']`.

- [ ] **Krok 5: Uruchom testy, build i lint.**

Run: `cd frontend && npm test -- --run && npm run build && npm run lint`
Oczekiwane: PASS, zielone.

- [ ] **Krok 6: Commit.**

```bash
git add frontend/src
git commit -m "feat(frontend): add appeal submission form with justification validation"
```

---

### Zadanie 11 (PR 5.8b): Historia odwołań i statystyki w modalu decyzji

**Pliki:**
- Utwórz: `frontend/src/components/appeals/AppealHistory.tsx`, `frontend/src/components/appeals/ActivityStats.tsx`, `frontend/src/hooks/useResolveAppeal.ts`, `frontend/src/hooks/useActivityStats.ts`
- Zmień: `frontend/src/components/leases/DecisionModal.tsx` (opcjonalny kontekst odwołania), `frontend/src/pages/AppealsPage.tsx` (otwieranie modala z wniosku), `frontend/src/api/appeals.ts`, `frontend/src/api/leases.ts` (`fetchActivityStats`), `frontend/src/test/msw/handlers.ts`
- Test: `frontend/src/components/appeals/AppealHistory.test.tsx`

**Interfejsy:**
- Produkuje: `AppealHistory({ appeals }: { appeals: Appeal[] }): React.JSX.Element`; `ActivityStats({ stats }: { stats: LeaseActivityStats }): React.JSX.Element`; `fetchActivityStats(lease_id: number): Promise<LeaseActivityStats>`; `useActivityStats(lease_id: number): UseQueryResult<LeaseActivityStats>`; `postResolveAppeal(appeal_id: number, request: LeaseDecisionRequest): Promise<Appeal>`; `useResolveAppeal(): UseMutationResult<...>`; `DecisionModal` przyjmuje dodatkowo opcjonalny prop `appeal?: Appeal`.
- Konsumuje: `DecisionModal` (zadanie 7), `useAppeals` (zadanie 10).

- [ ] **Krok 1: Napisz failing test historii odwołań.**

```tsx
it('renders the appeal history with statuses and long justification wraps', () => {
  renderWithProviders(<AppealHistory appeals={[pendingAppeal, rejectedAppeal]} />);

  expect(screen.getByText('Oczekujące')).toBeInTheDocument();
  expect(screen.getByText('Odrzucone')).toBeInTheDocument();
  const justification = screen.getByText(/Prowadzę release/);
  expect(justification.className).toContain('break-words');
});
```

- [ ] **Krok 2: Napisz failing test statystyk aktywności.**

```tsx
it('renders activity counts per event type', () => {
  renderWithProviders(<ActivityStats stats={{ push: 0, review: 4, comment: 7 }} />);
  expect(screen.getByText('Push')).toBeInTheDocument();
  expect(screen.getByText('Review')).toBeInTheDocument();
  expect(screen.getByText('Komentarze')).toBeInTheDocument();
  expect(screen.getByTestId('stat-review')).toHaveTextContent('4');
});
```

- [ ] **Krok 3: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/components/appeals/AppealHistory.test.tsx`
Oczekiwane: FAIL — brak komponentów.

- [ ] **Krok 4: Zaimplementuj komponenty i podłącz je do modala.**

`DecisionModal` przyjmuje opcjonalny `appeal`; gdy jest podany, pokazuje uzasadnienie wniosku, `AppealHistory` oraz `ActivityStats` (dane z `useActivityStats(lease_id)` → `GET /api/v1/leases/{id}/activity-stats`, ścieżkę potwierdza krok 4.4), a decyzję wysyła przez `POST /api/v1/appeals/{id}/decision` (payload jak w decyzji o dzierżawie). Po sukcesie: toast `Decyzja zapisana` i inwalidacja `['appeals']`, `['leases']`, `['audit']`, `['dashboard']`.

- [ ] **Krok 5: Uruchom testy, build i lint.**

Run: `cd frontend && npm test -- --run && npm run build && npm run lint`
Oczekiwane: PASS, zielone.

- [ ] **Krok 6: Commit.**

```bash
git add frontend/src
git commit -m "feat(frontend): show appeal history and activity stats in decision modal"
```

---

### Zadanie 12 (PR 5.9): Graf uprawnień (@xyflow/react)

**Pliki:**
- Utwórz: `frontend/src/api/graph.ts`, `frontend/src/api/fixtures/graph.json`, `frontend/src/hooks/useGraph.ts`, `frontend/src/lib/graphLayout.ts`, `frontend/src/components/graph/PermissionsGraph.tsx`, `frontend/src/components/graph/GraphFilters.tsx`
- Zmień: `frontend/src/pages/GraphPage.tsx`, `frontend/src/api/fixtures/index.ts`, `frontend/src/test/msw/handlers.ts`
- Test: `frontend/src/lib/graphLayout.test.ts`, `frontend/src/pages/GraphPage.test.tsx`

**Interfejsy:**
- Produkuje: `fetchGraph(): Promise<GraphResponse>`; `useGraph(): UseQueryResult<GraphResponse>`; `applyColumnLayout(nodes: GraphNode[]): GraphNode[]`; `PermissionsGraph({ nodes, edges, showOnlyRisk }: PermissionsGraphProps): React.JSX.Element`; `GraphFilters({ teams, team, onTeamChange, onlyRisk, onOnlyRiskChange }: GraphFiltersProps): React.JSX.Element`.
- Konsumuje: typy `GraphNode`, `GraphEdge`, `GraphResponse` (zadanie 2), `getStatusBadge` (zadanie 2).

- [ ] **Krok 1: Napisz failing test układu kolumnowego.**

```ts
it('assigns deterministic columns by node type when position is missing', () => {
  const laidOut = applyColumnLayout([
    { id: 'u1', type: 'user', data: { label: 'kamil' } },
    { id: 't1', type: 'team', data: { label: 'DEV' } },
    { id: 'r1', type: 'repo', data: { label: 'core-api' } },
  ]);

  const x = (id: string) => laidOut.find((n) => n.id === id)!.position!.x;
  expect(x('u1')).toBeLessThan(x('t1'));
  expect(x('t1')).toBeLessThan(x('r1'));
  expect(applyColumnLayout(laidOut)[0].position).toEqual(laidOut[0].position);
});
```

- [ ] **Krok 2: Napisz failing testy widoku grafu i filtrów.**

```tsx
it('renders nodes and edges from the API payload', async () => {
  renderWithProviders(<GraphPage />);
  expect(await screen.findByTestId('graph-nodes')).toHaveTextContent('12');
  expect(screen.getByTestId('graph-edges')).toHaveTextContent('9');
});

it('filters by team and by elevated risk', async () => {
  const user = userEvent.setup();
  renderWithProviders(<GraphPage />);

  await user.selectOptions(await screen.findByLabelText('Zespół'), 'QA');
  expect(screen.getByTestId('graph-nodes')).toHaveTextContent('5');

  await user.click(screen.getByLabelText('Tylko podwyższone ryzyko'));
  expect(screen.queryByText('core-api')).not.toBeInTheDocument();
});
```

- [ ] **Krok 3: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/lib/graphLayout.test.ts src/pages/GraphPage.test.tsx`
Oczekiwane: FAIL — brak modułów.

- [ ] **Krok 4: Zaimplementuj warstwę danych i układ: `api/graph.ts`, `graph.json`, `useGraph`, `lib/graphLayout.ts`.**

Fixture `graph.json`: 12 węzłów (5 z `data.team === 'QA'`, 4 z `'DEV'`, 3 repozytoria) i 9 krawędzi; repozytorium `core-api` nie ma krawędzi o statusie `WARNING`/`EXPIRED`, żeby filtr ryzyka miał co odfiltrować. `applyColumnLayout` ustawia `x` wg typu (`user` < `team` < `repo`), `y` wg kolejności wystąpienia i jest idempotentne dla węzłów, które już mają `position`.

- [ ] **Krok 5: Zaimplementuj `PermissionsGraph`, `GraphFilters` i `GraphPage`.**

`PermissionsGraph` renderuje `ReactFlow` z `nodes`/`edges`; kolor węzła i krawędzi wynika ze statusu (`getStatusBadge`). Filtry: zespół (po `data.team`) oraz „Tylko podwyższone ryzyko" (zostawia węzły połączone z krawędzią o statusie `WARNING`/`EXPIRED`). Komponent wystawia liczniki widocznych elementów w `data-testid="graph-nodes"` i `data-testid="graph-edges"`. Dane pochodzą z `GET /api/v1/graph` (4.6) w formacie React Flow; brak `position` uzupełnia `applyColumnLayout`. Stan pusty: „Brak danych do wyświetlenia".

- [ ] **Krok 6: Uruchom testy, build i lint.**

Run: `cd frontend && npm test -- --run && npm run build && npm run lint`
Oczekiwane: PASS, zielone.

- [ ] **Krok 7: Commit.**

```bash
git add frontend/src
git commit -m "feat(frontend): add permissions graph with team and risk filters"
```

---

### Zadanie 13 (PR 5.10): Dziennik audytu

**Pliki:**
- Utwórz: `frontend/src/api/audit.ts`, `frontend/src/api/fixtures/audit.json`, `frontend/src/hooks/useAuditLog.ts`, `frontend/src/components/audit/AuditLogTable.tsx`, `frontend/src/components/audit/AuditFilters.tsx`
- Zmień: `frontend/src/pages/AuditPage.tsx`, `frontend/src/api/fixtures/index.ts`, `frontend/src/test/msw/handlers.ts`
- Test: `frontend/src/pages/AuditPage.test.tsx`

**Interfejsy:**
- Produkuje: `fetchAuditLog(): Promise<{ entries: AuditEntry[] }>`; `useAuditLog(): UseQueryResult<{ entries: AuditEntry[] }>`; `AuditLogTable({ entries }: { entries: AuditEntry[] }): React.JSX.Element`; `AuditFilters({ actorType, onChange }: AuditFiltersProps): React.JSX.Element`.
- Konsumuje: `formatDateTimePl` (zadanie 2), typ `AuditEntry` (zadanie 2).

- [ ] **Krok 1: Napisz failing test tabeli i filtra aktora.**

```tsx
it('renders audit entries and filters by actor type', async () => {
  const user = userEvent.setup();
  renderWithProviders(<AuditPage />);

  expect(await screen.findByText('lease.extend')).toBeInTheDocument();
  expect(screen.getByText('SYSTEM')).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText('Aktor'), 'ADMIN');
  expect(screen.queryByText('SYSTEM')).not.toBeInTheDocument();
});

it('renders the empty state', async () => {
  server.use(http.get('/api/v1/audit', () => HttpResponse.json({ entries: [] })));
  renderWithProviders(<AuditPage />);
  expect(await screen.findByText('Brak zdarzeń w dzienniku')).toBeInTheDocument();
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/pages/AuditPage.test.tsx`
Oczekiwane: FAIL — brak strony i komponentów.

- [ ] **Krok 3: Zaimplementuj API, fixture, hook, tabelę, filtr i stronę.**

Fixture `audit.json` zawiera co najmniej wpis `lease.extend` aktora `SYSTEM` oraz wpis aktora `ADMIN`, żeby test filtra miał co odfiltrować. Kolumny: Czas (`formatDateTimePl`), Aktor (`ADMIN`/`USER`/`SYSTEM`), Akcja, Cel, Uzasadnienie (`—` gdy brak; `break-words` dla długich treści). Filtr aktora działa po stronie klienta. Widok jest samodzielny — może go przejąć Osoba 6 bez zależności od pozostałych stron.

- [ ] **Krok 4: Uruchom testy, build i lint.**

Run: `cd frontend && npm test -- --run && npm run build && npm run lint`
Oczekiwane: PASS, zielone.

- [ ] **Krok 5: Commit.**

```bash
git add frontend/src
git commit -m "feat(frontend): add audit log view with actor filter"
```

---

### Zadanie 14: Test integracyjny przepływu pitch i weryfikacja końcowa

**Pliki:**
- Utwórz: `frontend/src/App.integration.test.tsx`
- Zmień: `frontend/src/test/msw/handlers.ts`, `frontend/src/test/msw/state.ts` (stanowa symulacja: zegar + mutacje dzierżaw i odwołań)
- Test: `frontend/src/App.integration.test.tsx`

**Interfejsy:**
- Produkuje: `getSimulatedNow()` odzwierciedlający kolejne skoki zegara; stanowe handlery decyzji i odwołań aktualizujące fixture'y.
- Konsumuje: wszystkie wcześniejsze zadania.

- [ ] **Krok 1: Napisz failing test integracyjny `walks_the_demo_pitch_flow`.**

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import App from '@/App';

it('walks the demo pitch flow over MSW', async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/' });

  // 1. Stan wyjściowy: licznik ostrzeżeń i dzierżawy
  expect(await screen.findByTestId('kpi-warning')).toHaveTextContent('1');

  // 2. Podróż w czasie o 25 dni → dzierżawa aktywna wchodzi w okno ostrzegawcze
  await user.type(screen.getByLabelText('Własna liczba dni'), '25');
  await user.click(screen.getByRole('button', { name: 'Przesuń' }));
  await user.click(screen.getByRole('link', { name: 'Dzierżawy' }));
  expect(await screen.findByText('Pozostało 5 dni')).toBeInTheDocument();

  // 3. Odwołanie i decyzja 2x
  await user.click(screen.getByRole('link', { name: 'Odwołania' }));
  await user.selectOptions(await screen.findByLabelText('Dzierżawa'), '2');
  await user.type(screen.getByLabelText('Uzasadnienie'), 'Prowadzę release v2.1');
  await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));
  await user.click(await screen.findByRole('button', { name: 'Rozpatrz' }));
  await user.click(screen.getByRole('button', { name: '2x' }));
  await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));
  expect(await screen.findByText('Decyzja zapisana')).toBeInTheDocument();

  // 4. Kolejne +35 dni → wygaśnięcie i próba odebrania uprawnień ostatniemu adminowi
  await user.type(screen.getByLabelText('Własna liczba dni'), '35');
  await user.click(screen.getByRole('button', { name: 'Przesuń' }));
  await user.click(screen.getByRole('link', { name: 'Dzierżawy' }));
  const adminRow = await screen.findByRole('row', { name: /tomasz-admin/ });
  await user.click(within(adminRow).getByRole('button', { name: 'Decyzja' }));
  await user.click(screen.getByRole('button', { name: 'Wyłącz' }));
  await user.click(screen.getByRole('button', { name: 'Potwierdzam wyłączenie' }));
  await waitFor(() =>
    expect(screen.getByText('Nie można odebrać uprawnień ostatniemu administratorowi.')).toBeInTheDocument(),
  );
});
```

- [ ] **Krok 2: Uruchom test i potwierdź FAIL.**

Run: `cd frontend && npm test -- --run src/App.integration.test.tsx`
Oczekiwane: FAIL — brak stanowej symulacji w handlerach (statusy nie przeliczają się po skoku zegara).

- [ ] **Krok 3: Uzupełnij stanowe handlery MSW.**

Handlery mutują kopię fixture'ów (`extend` przesuwa `expires_at`, `revoke`/`downscope` zmieniają `role`), a `GET /api/v1/leases` zwraca bieżący stan. Napraw wyłącznie błędy integracji — nie duplikuj logiki czasu ani etykiet w komponentach.

- [ ] **Krok 4: Uruchom pełny zestaw testów, build i lint.**

Run: `cd frontend && npm test -- --run && npm run build && npm run lint`
Oczekiwane: PASS, build i lint zielone.

- [ ] **Krok 5: Ręcznie odtwórz pitch flow** (`npm run dev` + backend): stan wyjściowy → `+25 dni` → ostrzeżenia → odwołanie i decyzja `2x` → `+35 dni` → wygaśnięcie → próba usunięcia ostatniego admina → audyt i graf.

- [ ] **Krok 6: Commit.**

```bash
git add frontend/src
git commit -m "test(frontend): cover the demo pitch flow end to end"
```
