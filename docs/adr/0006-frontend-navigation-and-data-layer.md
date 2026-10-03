# ADR 0006: Frontend SPA — nawigacja, warstwa danych i praca na kontrakcie

## Kontekst

ADR 0001 ustalił stos technologiczny frontendu (React 19 + React Compiler + TypeScript + Vite + Tailwind CSS + shadcn/ui + `@xyflow/react`), ale nie rozstrzyga czterech rzeczy, które dotyczą całego panelu i współpracowników: jak nawigować między sześcioma widokami, gdzie trzymać stan serwerowy, jak pracować, gdy kontrakt API (1.2) i fixture'y (6.1) powstają równolegle, oraz skąd frontend bierze czas symulowany. ADR 0003 wymaga, aby pasek czasu natychmiast odświeżał stan dzierżaw, a ADR 0001 — bezawaryjnej prezentacji na żywo.

## Decyzja

1. **Nawigacja: `react-router-dom` v7 (tryb deklaratywny).** Każdy widok ma własny adres (`/`, `/leases`, `/appeals`, `/baseline`, `/graph`, `/audit`), dzięki czemu odświeżenie strony podczas prezentacji nie gubi kontekstu, a stany można linkować.
2. **Stan serwerowy: TanStack Query v5.** Cache, stany ładowania i błędów oraz jednopunktowa inwalidacja po podróży w czasie i po każdej decyzji. Nie wprowadzamy globalnego store'a (Redux/Zustand) — stan kliencki to stan lokalny komponentów.
3. **Praca na kontrakcie (contract-first) z fixture'ami.** `src/types/api.ts` jest źródłem DTO, a fixture'y JSON mają typowany re-export, więc rozjazd z kontraktem 1.2 łamie kompilację. Flaga `VITE_USE_FIXTURES` przełącza odczyty na fixture'y, co pozwala rozwijać i demonstrować panel przed ukończeniem API; mutacje zawsze wykonują realne żądania.
4. **Czas symulowany pochodzi z backendu.** Frontend pobiera „teraz" z `GET /api/v1/simulation/clock` i nigdy nie używa zegara systemowego w logice dzierżaw. Statusy i liczba pozostałych dni liczone są czystymi funkcjami `lib/dateTime.ts` z jawnym `simulated_now`, z granicami spójnymi z backendem: `<= 0` dni → `EXPIRED`, `<= 7` dni → `WARNING`. Liczniki dashboardu pozostają autorytatywne po stronie backendu (4.6).
5. **Testy: Vitest 5 + React Testing Library + MSW 3.** Handlery MSW budowane są z tych samych fixture'ów, które zasilają tryb `VITE_USE_FIXTURES`, więc dane runtime i dane testowe mają jedno źródło prawdy.
6. **Motyw ciemny domyślnie, implementacja tokenowa.** Zgodnie z ADR 0001 i `PLAN.md`; komponenty korzystają wyłącznie z tokenów shadcn/ui, więc zmiana na motyw jasny jest jednopunktowa. Przełącznika motywów w MVP nie ma.

## Konsekwencje

- **Zalety:** spójne wzorce w całym panelu, demo odporne na brak backendu, rozjazdy kontraktu wychwytywane w kompilacji, jedno miejsce prawdy dla dat i badge'y statusów, testy bez mockowania zegara.
- **Koszty i ograniczenia:** trzy dodatkowe zależności (router, TanStack Query, MSW) poza minimalnym stosem; fixture'y trzeba utrzymywać w zgodzie z DTO (pilnowane typowanym re-exportem); dyscyplina „żadnych obliczeń czasu poza `lib/dateTime.ts`".
- **Zależność zewnętrzna:** kontrakt `GET /api/v1/simulation/clock` oraz pola `last_activity` i `recommended_action` w DTO dzierżawy muszą zostać potwierdzone w kroku 1.2 i dostarczone przez backend.
