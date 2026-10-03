# Frontend — GitHub Access Lease Governor

Konsola administratora bezpieczeństwa IT (SPA) do zarządzania odnawialnymi dostępami czasowymi GitHuba.
Stack: **React 19 + React Compiler + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui + TanStack Query + React Router + `@xyflow/react`**.

## Wymagania

- Node.js 24+
- Backend FastAPI z katalogu `../backend` (dla danych na żywo; panel działa też na fixture'ach)

## Instalacja i uruchomienie

```bash
npm install
npm run dev          # http://localhost:5173
```

Zapytania do `/api/*` są proxowane przez Vite na `http://localhost:8000` (konfiguracja w `vite.config.ts`), więc backend nie potrzebuje CORS.

> **Uwaga dla agentów AI / środowisk sandbox:** katalog `~/.npm` bywa niedostępny. Wtedy każdą komendę npm/npx poprzedź zmienną:
> `export npm_config_cache=/home/kuba/Documents/projects/LongTailsOnly/.npm-cache`

## Skrypty

| Komenda                                   | Działanie                    |
| ----------------------------------------- | ---------------------------- |
| `npm run dev`                             | serwer deweloperski Vite     |
| `npm run build`                           | `tsc -b` + produkcyjny build |
| `npm run preview`                         | podgląd builda               |
| `npm test`                                | Vitest w trybie watch        |
| `npm run test:run`                        | pełny przebieg testów (CI)   |
| `npm run lint` / `npm run lint:fix`       | ESLint (flat config)         |
| `npm run format` / `npm run format:check` | Prettier                     |
| `npm run typecheck`                       | sprawdzenie typów (`tsc -b`) |

Hook `pre-commit` (husky + lint-staged) formatuje i naprawia lintem pliki ze stage'a.

## Wybór usługi (`src/services/`)

Panel nie jest konsolą jednej integracji: kontrolka w pasku górnym przełącza **usługę (dostawcę)**, a nie organizację (ADR 0014). Trasy pozostają płaskie (`/leases`, nie `/github/leases`) — usługa deklaruje, które z nich obsługuje.

| Plik                    | Rola                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serviceRegistry.ts`    | **jedyne źródło prawdy dla UI**: trasa, etykieta nawigacji i ikona per usługa (`SERVICE_REGISTRY`, `getServiceConfig`, `getDefaultPath`, `isRouteSupported`, `fallbackIcon`). `Sidebar` i strażnik tras czytają z niej, więc nie ma drugiej listy. |
| `brandIcons.tsx`        | Dwa własne znaki firmowe (`GitHubIcon`, `GitLabIcon`) — lucide usunął ikony marek. `GitLabIcon` czeka na przyszły adapter i **celowo** nie jest przypisany do `demo-tracker`.                                                                      |
| `ServicesContext.tsx`   | `ServicesProvider` (`useServices()` → katalog), `useActiveService()` i `useServicesContext()` — oba hooki **rzucają** poza providerem. Rozstrzyga aktywną usługę i pilnuje bramki wyboru (spec §5.6.1).                                            |
| `ServiceRouteGuard.tsx` | Bramka tras wewnątrz `AppShell`: nieobsługiwana trasa → deklaratywne `<Navigate>` na trasę domyślną usługi.                                                                                                                                        |

Dane katalogu: `GET /api/v1/services` przez `src/api/services.ts` i `useServices()` (klucz `['services']` **globalny** — katalog wyznacza usługę, więc nie może zależeć od niej samej). Bez backendu fixture `src/api/fixtures/services.ts` re-eksportuje `shared/fixtures/services.json`. `capabilities` są posortowane po stronie backendu, więc kolejność nie niesie znaczenia.

**Klucz `localStorage`: `lease-governor.service`.** Wartością jest **goły identyfikator** usługi (`github`, `demo-tracker`) — bez `JSON.parse` i bez koperty. Odczyt jest leniwy (inicjalizator `useState`), zapis siedzi w setterze `setActiveService`, a oba są w `try/catch`: prywatny tryb przeglądarki nie może wywalić panelu, a brak zapisu nie blokuje działania. Zapis **nie jest kasowany**, gdy katalog go nie potwierdzi — wybór degraduje się tylko na czas sesji. Wybór jest przyjmowany w trzech stanach katalogu (znany / w drodze / padnięty), a nieprzyjęty nie nadpisuje zapisu.

**Co czytać przy zmianie:** trasy i ikony zmienia się w `serviceRegistry.ts`, nie w `Sidebar.tsx` ani `App.tsx`; `App.tsx` nadal deklaruje sześć tras, a strażnik tylko je bramkuje. Bramki czytników danych (`enabled: !isPending && activeService.id !== ''`) i ich uzasadnienie opisuje kanoniczny komentarz w `src/hooks/useLeases.ts` — na niego wskazuje siedem pozostałych hooków.

## Kontrakt API

`src/types/api.ts` jest **generowany** z backendu (ADR 0009) i nie wolno go edytować ręcznie. Po zmianie schematów Pydantic:

```bash
cd ../backend && uv run python scripts/export_contract.py
npx --yes json-schema-to-typescript@15 -i contract/schema.json -o ../frontend/src/types/api.ts \
  --unreachableDefinitions --additionalProperties=false
```

Plik jest wpisany w `.prettierignore` (formatuje go generator, ADR 0009), więc regeneracja nie zapala bramki `format:check`.

## Dane bez backendu

Flaga `VITE_USE_FIXTURES=true` przełącza **odczyty** na fixture'y z `src/api/fixtures/` (mutacje zawsze idą do API). Fixture'y mają kształt typów z kontraktu, więc rozjazd jest błędem kompilacji.

```bash
VITE_USE_FIXTURES=true npm run dev
```

## Testy

- Vitest + React Testing Library + MSW 3.
- Handlery MSW są rozbite per domena w `src/test/msw/domains/` i spinane w `src/test/msw/handlers.ts`.
- `src/test/msw/state.ts` trzyma stan symulacji (zegar, zapisane żądania) i **emuluje backend** — przelicza `status`, `days_remaining` i `recommendation`, bo frontend tych wartości nie liczy.
- Komponenty testujemy przez `renderWithProviders` (`src/test/renderWithProviders.tsx`), które zakłada świeży `QueryClient` i `MemoryRouter`.

## Dokumentacja

- `docs/superpowers/specs/2026-10-03-frontend-spa-design.md` — specyfikacja frontendu
- `docs/superpowers/plans/2026-10-03-frontend-spa.md` — plan zadań (PR 5.1–5.10)
- `DESIGN.md` — język projektowy panelu (tokeny, statusy, typografia)
- `../CODING_STANDARDS.md` — standardy kodu (limit 300 linii, jawne typy, zakaz `useMemo`/`useCallback`)
