# ADR 0015: Frontend SPA — nawigacja, warstwa danych i praca na generowanym kontrakcie

## Kontekst

ADR 0001 ustalił stos technologiczny frontendu (React 19 + React Compiler + TypeScript + Vite + Tailwind CSS + shadcn/ui + `@xyflow/react`), a ADR 0009 rozstrzygnął, że typy TS frontendu są generowane ze schematów Pydantic. Pozostają decyzje dotyczące całego panelu: jak nawigować między sześcioma widokami, gdzie trzymać stan serwerowy, jak pracować, gdy endpointy 2.5 oraz 3.6–4.6 jeszcze nie istnieją, i skąd frontend bierze czas oraz status dostępu. ADR 0003 wymaga natychmiastowego odświeżenia stanu po podróży w czasie, a ADR 0001 — bezawaryjnej prezentacji na żywo.

## Decyzja

1. **Nawigacja: `react-router-dom` v7 (tryb deklaratywny).** Każdy widok ma własny adres (`/`, `/leases`, `/appeals`, `/baseline`, `/graph`, `/audit`), więc odświeżenie strony podczas prezentacji nie gubi kontekstu, a `AppShell` pełni rolę layout route.
2. **Stan serwerowy: TanStack Query v5.** Cache, stany ładowania i błędów oraz jednopunktowa inwalidacja po podróży w czasie i po każdej decyzji. Nie wprowadzamy globalnego store'a (Redux/Zustand) — stan kliencki to stan lokalny komponentów.
3. **Kontrakt generowany, nie przepisywany.** `frontend/src/types/api.ts` powstaje z `backend/contract/schema.json` (ADR 0009) i nie jest edytowany ręcznie; brakujące DTO dodajemy w `backend/app/schemas/` i regenerujemy kontrakt. Fixture'y używają typów z kontraktu, a flaga `VITE_USE_FIXTURES` przełącza odczyty na fixture'y (mutacje zawsze wykonują realne żądania).
4. **Czas i status liczy backend.** `ClockRead.now` z `GET /api/v1/simulation/clock` jest jedynym źródłem „teraz”, a `status`, `days_remaining` i `recommendation` przychodzą policzone w `LeaseOverview` (z historii zdarzeń i zegara). Frontend nie używa zegara systemowego ani nie powtarza granic 7/0 dni — `lib/dateTime.ts` odpowiada wyłącznie za formatowanie dat i walidację daty wybranej w modalu. Reset scenariusza to `POST /api/v1/demo/reset` (zeruje zegar i przywraca seed).
5. **Testy: Vitest + React Testing Library + MSW 3.** Handlery MSW budowane są z tych samych fixture'ów, które zasilają tryb `VITE_USE_FIXTURES`, więc dane runtime i dane testowe mają jedno źródło prawdy.
6. **Motyw ciemny domyślnie, implementacja tokenowa.** Zgodnie z ADR 0001 i `PLAN.md`; komponenty korzystają wyłącznie z tokenów shadcn/ui, więc zmiana na motyw jasny jest jednopunktowa. Przełącznika motywów w MVP nie ma.

## Konsekwencje

- **Zalety:** brak ręcznego przepisywania typów (rozjazd nazw pól jest błędem kompilacji), spójność statusów między frontem i backendem bez duplikowania reguł, demo odporne na brakujące endpointy, jedno miejsce prawdy dla formatowania dat i etykiet.
- **Koszty i ograniczenia:** trzy dodatkowe zależności (router, TanStack Query, MSW) poza minimalnym stosem; fixture'y trzeba utrzymywać w kształcie kontraktu; zmiana DTO wymaga regeneracji kontraktu po stronie backendu (ADR 0009), a nie edycji pliku TS.
- **Zależności zewnętrzne:** `GET /api/v1/simulation/clock` (krok 2.5) oraz endpointy kroków 3.6 i 4.2–4.6 wypisane w specyfikacji §5 — do czasu ich dostarczenia frontend pracuje na fixture'ach.
