# ADR 0001: Wybór stosu technologicznego i architektury SPA

## Kontekst
Projekt bierze udział w hackathonie w kategorii Defence (ścieżka Prelint). Wymaga szybkiej implementacji, bezawaryjnej prezentacji na żywo (live demo) oraz pełnej kontroli nad symulowanym czasem i stanem danych. Aplikacja ma stanowić konsolę administratora bezpieczeństwa IT (Security Admin Panel).

## Decyzja
Przyjmujemy rozdzieloną architekturę klient-serwer w modelu **Single Page Application (SPA)**:

### 1. Backend: Python 3.12 + FastAPI + SQLAlchemy 2.0 (Architektura Portów i Adapterów)
- **FastAPI**: Asynchroniczny, natywna walidacja typów przez Pydantic v2, automatyczna dokumentacja OpenAPI/Swagger.
- **Baza danych**: SQLite z driverem asynchronicznym `aiosqlite` oraz SQLAlchemy 2.0 (`Mapped`, `mapped_column`, `select()`).
  - *Uzasadnienie:* Brak konieczności uruchamiania zewnętrznych kontenerów bazodanowych podczas demo; możliwość błyskawicznego resetu i załadowania deterministycznego seeda danych.
- **Architektura Portów i Adapterów (Hexagonal / Plugin Architecture)**:
  - Rdzeń domenowy (`LeaseEngine`, `BaselineService`, `PolicyEvaluator`) jest całkowicie odseparowany od konkretnego dostawcy VCS/IAM za pomocą interfejsów (portów).
  - Integracje z systemami zewnętrznymi stanowią wymienne adaptery (w MVP: `GitHubMockAdapter`, w przyszłości: GitLab, Bitbucket, AWS IAM, Azure DevOps).
  - Zegar symulowany (`TimeProvider`) wstrzykiwany jest jako adapter czasu.

### 2. Frontend: React 19 (React Compiler) + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **React 19 & React Compiler**:
  - Automatyczna memoizacja i optymalizacja renderowania bez konieczności ręcznego zarządzania `useMemo` / `useCallback`.
  - Nowoczesny standard komponentów funkcyjnych.
- **Tailwind CSS + shadcn/ui**:
  - Gotowy, spójny system wzorniczy pasujący do paneli cyberdefence (ciemny motyw, czytelne wskaźniki statusów).
  - Komponenty kopiowane i wbudowane bezpośrednio do kodu bez ciężkich zależności zewnętrznych.
- **Graf relacji (@xyflow/react / React Flow)**:
  - Wizualizacja węzłów użytkowników, zespołów i repozytoriów.

### 3. Komunikacja i format danych
- REST API (JSON) ze ścisłymi schematami Pydantic v2 na backendzie i odpowiadającymi im interfejsami TypeScript na frontendzie.

## Konsekwencje
- **Zalety**: Determinizm demonstracji, zero zewnętrznych usług chmurowych, brak narzutu dockerowego, estetyczny i responsywny interfejs SPA.
- **Ograniczenia**: SQLite jest jednowątkowy przy zapisie, co jest w zupełności wystarczające dla demonstracji panelu administracyjnego.
