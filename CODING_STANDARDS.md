# CODING_STANDARDS: Standardy inżynierii kodu (Pure MVP Demo)

Dokument definiuje reguły wytwarzania kodu w projekcie GitHub Access Lease Governor dla stacku Python/FastAPI (backend) oraz TypeScript/React 19 (frontend SPA). 

Celem nadrzędnym jest **maksymalna czytelność, modułowość i szybkość dostarczenia stabilnego demo (MVP)** bez zbędnego balastu.

---

### 1. Złote zasady architektury i higieny kodu

1. **Twardy limit wielkości pliku: max 300 linii**:
   - Każdy plik przekraczający 300 linii kodu kwalifikuje się do natychmiastowego podziału na mniejsze podmoduły.
   - Komponenty UI dzielimy na mniejsze cząstki funkcyjne, a logikę backendu wydzielamy do dedykowanych serwisów.
2. **Zakaz bloatowania utilami i powtórzeniami (DRY)**:
   - Zanim napiszesz funkcję formatującą datę, kalkulację dni czy helper stylów — **zawsze sprawdź istniejący katalog `utils/` lub `lib/`**.
   - Wszystkie formatowania dat, badge'y statusów czy parsowania błędów API muszą mieć dokładnie jedno źródło prawdy w projekcie.
3. **Testy zgodnie z TDD**:
   - Implementację prowadzimy w cyklu Red-Green-Refactor: najpierw test, następnie minimalny kod produkcyjny i refaktoryzacja.
4. **Spójne sygnatury funkcji**:
   - **Frontend (TS/React)**: Wyłącznie standardowe deklaracje funkcji z explicite typowanymi parametrami i typem zwracanym:
     ```typescript
     export function UserLeaseCard({ lease, onExtend }: UserLeaseCardProps): React.JSX.Element { ... }
     export function formatDaysRemaining(expiresAt: string, simulatedNow: string): string { ... }
     ```
   - **Backend (Python)**: Jawne type hints dla każdego argumentu i zwracanej wartości (`def calculate_lease_status(lease: Lease, now: datetime) -> LeaseStatus:`).
5. **Karpathy Guidelines**:
   - Żadnych abstrakcji i generycznych fabryk dla jednorazowego widoku.
   - Chirurgiczne zmiany: dotykamy tylko tego, co niezbędne dla realizowanego feature'a.

---

### 2. Backend: Python 3.12 + FastAPI + SQLAlchemy 2.0

#### Struktura katalogów
```
backend/
└── app/
    ├── api/               # Routery FastAPI (leases, appeals, audit, simulation)
    ├── core/              # Konfiguracja i ustawienia
    ├── db/                # Baza SQLite, seed danych, sesja
    ├── models/            # Modele ORM (User, Repo, Lease, ActivityEvent, AuditLog, Appeal)
    ├── schemas/           # Pydantic v2 DTO
    ├── ports/             # Abstrakcyjne interfejsy (VCSProvider, ClockPort)
    ├── adapters/          # Adaptery zewnętrzne (GitHubMockAdapter, SimulatedClockAdapter)
    ├── services/          # Logika domenowa (LeaseEngine, BaselineService, AppealService)
    ├── utils/             # Wspólne pomocniki (daty, formatowanie)
    └── main.py            # Entrypoint aplikacji
```

#### Standardy backendu
- **Asynchroniczność**: Endpointy i zapytania bazodanowe oparte na `async`/`await` (SQLAlchemy 2.0 async session).
- **Zegar symulowany (Simulated Clock)**:
  - Wszelkie kalkulacje czasu (upłynięcie dzierżawy, okno ostrzegawcze) opierają się na `time_provider.get_current_time()`.
  - Zegar można przesuwać endpointem `/api/v1/simulation/time-travel`.
- **Modele i DTO**:
  - Pydantic v2 z jawnym mapowaniem `from_attributes = True`.
  - Modele ORM w SQLAlchemy 2.0 korzystają z `Mapped[...]` i `mapped_column(...)`.

---

### 3. Frontend: React 19 + React Compiler + Vite + Tailwind CSS + shadcn/ui (SPA)

#### Struktura katalogów
```
frontend/
└── src/
    ├── components/        # Modułowe komponenty (każdy < 300 linii)
    │   ├── ui/            # Komponenty bazowe (shadcn/ui: button, dialog, badge, table itp.)
    │   ├── layout/        # Navbar, Sidebar, TimeTravelBar
    │   ├── leases/        # Widok dzierżaw, karty ostrzeżeń, modal decyzji
    │   ├── baseline/      # Widok standardu zespołów
    │   └── graph/         # Graf uprawnień (@xyflow/react)
    ├── hooks/             # Custom hooks (API data fetching)
    ├── lib/               # Utility functions (cn, apiClient, dateTime)
    ├── types/             # Typy TypeScript (współdzielone interfejsy)
    ├── App.tsx
    └── main.tsx
```

#### Standardy frontendu
- **Architektura SPA**:
  - Całość działa jako Single Page Application z płynną nawigacją modułową (Dashboard, Leases, Baseline, Graph, Audit).
- **React 19 & React Compiler**:
  - Korzystamy z automatycznej memoizacji zapewnianej przez React Compiler — **nie używamy ręcznie `useMemo` i `useCallback`**, chyba że w skrajnych przypadkach integracji z zewnętrznymi bibliotekami.
- **Komponenty shadcn/ui**:
  - Gotowe, minimalistyczne klocki interfejsu stylizowane za pomocą Tailwind CSS.
- **Konsolidacja Utilów (`src/lib/`)**:
  - `src/lib/dateTime.ts`: Wszystkie operacje na datach i porównaniach z czasem symulowanym.
  - `src/lib/statusBadges.ts`: Mapowanie statusów (`ACTIVE`, `WARNING`, `EXPIRED`) na kolory i etykiety.
  - `src/lib/utils.ts`: `cn()` dla klas Tailwind.
