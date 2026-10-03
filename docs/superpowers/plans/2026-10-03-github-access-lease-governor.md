# PLAN IMPLEMENTACJI: GitHub Access Lease Governor (MVP Demo)

Projekt jest realizowany w architekturze **Single Page Application (SPA)**:
- **Frontend**: React 19 + React Compiler + Vite + Tailwind CSS + shadcn/ui + @xyflow/react
- **Backend**: Python 3.12 + FastAPI + SQLAlchemy 2.0 (async SQLite) + Pydantic v2
- **Mock**: REST API GitHuba v3 z symulacją zdarzeń i sterowaniem czasem (Simulated Clock)

---

### Faza 1: Fundament Backendowy i Silnik Dzierżawy (Core & DB)

1. **Inicjalizacja struktury backendu**:
   - Utworzenie środowiska Python, instalacja: `fastapi`, `uvicorn`, `sqlalchemy`, `aiosqlite`, `pydantic`.
   - Konfiguracja `app/core/config.py` i mechanizmu `TimeProvider` (umożliwia przesunięcie zegara o N dni).
2. **Modele ORM i Baza Danych (`app/models/` & `app/db/`)**:
   - `User`: ID, login, name, team (`DEV` / `QA`), is_admin.
   - `Repository`: ID, name, owner (`org`), default_branch.
   - `Lease`: user_id, repo_id, current_role (`admin`/`maintain`/`push`/`triage`/`pull`), expires_at, last_activity_at, last_activity_type.
   - `Appeal`: lease_id, user_id, repo_id, requested_role, justification, status (`PENDING`, `APPROVED`, `REJECTED`), created_at, resolved_at.
   - `AuditLog`: timestamp, actor_type (`ADMIN`, `USER`, `SYSTEM`), actor_id, action, target, details, justification.
3. **Seed danych demonstracyjnych (`app/db/seed.py`)**:
   - 1 organizacja, 1 admin IT (`tomasz-admin`).
   - 2 zespoły: `DEV` (ok. 12 osób) i `QA` (ok. 6 osób).
   - 10 repozytoriów (np. `core-api`, `auth-service`, `payment-gw`, `frontend-app`, `infra-terraform`).
   - Przygotowane scenariusze demo:
     - Scenariusz A: Developer z `admin`, który tylko pushuje (kandydat do deeskalacji).
     - Scenariusz B: QA z wygasającym dostępem za 3 dni (okno ostrzegawcze + odwołanie).
     - Scenariusz C: Nieużywane repozytorium wygasłe całkowicie.
     - Scenariusz D: Nowy developer bez dostępów (gotowy do przyjęcia standardu zespołu).

---

### Faza 2: Logika Domenowa i Endpointy API (Services & Routers)

1. **GitHub Mock API Router (`app/api/github_mock/`)**:
   - Emulacja oficjalnych endpointów GitHuba:
     - `GET /api/v3/orgs/{org}/members`
     - `GET /api/v3/repos/{owner}/{repo}/collaborators`
     - `PUT /api/v3/repos/{owner}/{repo}/collaborators/{username}` (zmiana poziomu)
     - `DELETE /api/v3/repos/{owner}/{repo}/collaborators/{username}` (odebranie dostępu)
     - `GET /api/v3/repos/{owner}/{repo}/events` (aktywności)
   - Strażnik *Last Admin Protection*: blokada operacji usuwającej ostatniego admina repo/organizacji.
2. **Lease Engine & Time Travel Service (`app/services/lease_service.py`)**:
   - Wyliczanie stanu dzierżawy: `ACTIVE` (>7 dni), `WARNING` (<= 7 dni), `EXPIRED` (<= 0 dni).
   - Logika odnawiania w oparciu o hierarchię:
     - Akcja poziomu `push` odnawia tylko poziomy <= `push`.
     - Jeśli użytkownik ma `admin`, ale aktywność dotyczy tylko `push`, system flaguje: "Admin inactive, push active".
   - Endpoint `/api/v1/simulation/time-travel`: przesuwanie zegara o wybraną liczbę dni.
3. **Baseline Engine (`app/services/baseline_service.py`)**:
   - Wyliczanie standardu zespołu: repozytoria, w których >= 50% członków zespołu ma aktywność w ciągu 30 dni.
   - Proponowanie najniższego wymaganego poziomu (nigdy `admin`).
4. **Appeals & Audit Service (`app/services/appeal_service.py`)**:
   - Składanie odwołania przez użytkownika (wymóg unikalnego uzasadnienia).
   - Decyzje admina: `Extend` (7, 30, 90 dni, custom) lub `Revoke` / `Down-scope`.
   - Zapis każdego zdarzenia do nienaruszalnego rejestru audytowego.

---

### Faza 3: Frontend SPA (React 19 + shadcn/ui + React Flow)

1. **Inicjalizacja i konfiguracja frontendu**:
   - Vite + React 19 + React Compiler + Tailwind CSS + shadcn/ui.
   - Layout SPA: ciemny styl IT/Defence, TopBar z Time Travel Controllerem, Sidebar z przełączaniem widoków.
2. **Widok 1: Dashboard i Pasek Czasu (Simulation Bar)**:
   - Centralny licznik symulowanego czasu z przyciskami skoku (+7 dni, +30 dni, reset).
   - Karty KPI: Aktywne dzierżawy, Ostrzeżenia, Wygaśnięte, Rekomendacje deeskalacji.
3. **Widok 2: Inwentarz Dzierżaw (Access Leases Table)**:
   - Tabela: Użytkownik, Rola w zespole, Repozytorium, Przyznany poziom, Ostatnia aktywność, Pozostało dni, Status badge.
   - Szybkie akcje: Przedłuż, Zdeeskaluj (Down-scope), Odbierz.
4. **Widok 3: Centrum Ostrzeżeń i Odwołań (Appeals & Warnings)**:
   - Lista użytkowników w oknie ostrzegawczym.
   - Przegląd wniosków z uzasadnieniem biznesowym i historią poprzednich wniosków.
   - Modal decyzji administratora z wyborem nowego okresu ważności.
5. **Widok 4: Standard Zespołu (Team Baseline)**:
   - Prezentacja wyliczonego standardu dla DEV i QA.
   - Onboarding nowego developera: podgląd sugerowanych repozytoriów i zatwierdzenie 1 kliknięciem.
6. **Widok 5: Interaktywny Graf Uprawnień (React Flow)**:
   - Wizualizacja węzłów: Użytkownicy -> Zespoły -> Repozytoria z kolorystyką statusów dzierżawy.
   - Filtrowanie widoku według zespołu lub repozytorium o podwyższonym ryzyku.
7. **Widok 6: Dziennik Audytowy (Audit Log)**:
   - Oś czasu / tabela zdarzeń z filtrem akcji ludzkich vs automatycznych.

---

### Faza 4: Integracja, Polerowanie Demo i Prezentacja

1. **Weryfikacja scenariuszy prezentacyjnych (Pitch Flow)**:
   - Krok 1: Pokazanie stanu wyjściowego (czysty dashboard, zielone dzierżawy).
   - Krok 2: Użycie Time Travel (+25 dni) -> pojawienie się żółtych ostrzeżeń i wniosku o przedłużenie.
   - Krok 3: Demonstracja odwołania i deeskalacji admina do `push`.
   - Krok 4: Użycie Time Travel (+35 dni) -> wygaśnięcie nieużywanych dostępów.
   - Krok 5: Próba usunięcia ostatniego admina -> zadziałanie *Last Admin Protection*.
   - Krok 6: Podgląd audytu i grafu relacji.
