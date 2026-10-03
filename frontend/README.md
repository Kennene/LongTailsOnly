# Frontend — GitHub Access Lease Governor

Konsola administratora bezpieczeństwa IT (SPA) do zarządzania odnawialnymi dzierżawami dostępów GitHuba.
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

## Kontrakt API

`src/types/api.ts` jest **generowany** z backendu (ADR 0009) i nie wolno go edytować ręcznie. Po zmianie schematów Pydantic:

```bash
cd ../backend && uv run python scripts/export_contract.py
npx --yes json-schema-to-typescript@15 -i contract/schema.json -o ../frontend/src/types/api.ts \
  --unreachableDefinitions --additionalProperties=false
cd ../frontend && npx prettier --write src/types/api.ts
```

Ostatni krok jest obowiązkowy: generator ma własny styl (m.in. podwójne cudzysłowy), a `npm run format:check` pilnuje konfiguracji Prettiera — bez formatowania po regeneracji bramka „format" będzie czerwona.

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
