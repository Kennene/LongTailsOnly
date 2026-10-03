# PLAN IMPLEMENTACJI: GitHub Access Lease Governor (MVP Demo)

Projekt jest realizowany w architekturze **Single Page Application (SPA)** oraz wzorcu **Portów i Adapterów (Hexagonal / Plugin Architecture)**:
- **Frontend**: React 19 + React Compiler + Vite + Tailwind CSS + shadcn/ui + @xyflow/react
- **Backend**: Python 3.14 + FastAPI + SQLAlchemy 2.0 (async SQLite) + Pydantic v2
- **Porty i Adaptery**: Czysta separacja logiki dostępów od dostawcy VCS (`VCSProvider` port -> `GitHubMockAdapter`), co pozwala w przyszłości podpiąć GitLab, Bitbucket czy chmurowe IAM.
- **Mock**: REST API GitHuba v3 z symulacją zdarzeń (`/events`) i sterowaniem czasem (`SimulatedClockAdapter`).

---

### Faza 1: Fundament Backendowy i Silnik dostępów (Core & DB)

1. **Inicjalizacja struktury backendu (Ports & Adapters)**:
   - Utworzenie środowiska Python, instalacja: `fastapi`, `uvicorn`, `sqlalchemy`, `aiosqlite`, `pydantic`.
   - Zdefiniowanie portów: `ClockPort` (interfejs zegara) oraz `VCSProvider` (interfejs repozytoriów i telemetrii).
   - Implementacja adaptera zegara `SimulatedClockAdapter` z obsługą offsetu czasu (`TimeProvider`).
2. **Modele ORM i Baza Danych (`app/models/` & `app/db/`)**:
   - `User`: ID, login, name, team (`DEV` / `QA`), is_admin.
   - `Repository`: ID, name, owner (`org`), default_branch, default_lease_duration_days (domyślnie 30).
   - `Lease`: user_id, repo_id, current_role (`admin`/`write`/`read`), granted_at, expires_at, is_active.
   - `ActivityEvent`: ID, user_id, repo_id, timestamp, event_type (`PushEvent`, `PullRequestReviewEvent`, `IssueCommentEvent`), required_level (`write`/`read`).
   - `Appeal`: lease_id, user_id, repo_id, requested_role, justification, status (`PENDING`, `APPROVED`, `REJECTED`), created_at, resolved_at.
   - `AuditLog`: timestamp, actor_type (`ADMIN`, `USER`, `SYSTEM`), actor_id, action, target, details, justification.
3. **Seed danych demonstracyjnych (`app/db/seed.py`)**:
   - 1 organizacja, 1 admin IT (`tomasz-admin`, stały break-glass).
   - 2 zespoły: `DEV` (ok. 12 osób) i `QA` (ok. 6 osób).
   - 10 repozytoriów (np. `core-api`, `auth-service`, `payment-gw`, `frontend-app`, `infra-terraform`).
   - Przygotowane scenariusze demo:
     - Scenariusz A: Developer z rolą `write`, który nie pushuje od 25 dni, ale recenzuje PR-y (`PullRequestReviewEvent`) $\rightarrow$ kandydat do deeskalacji do `read`.
     - Scenariusz B: QA z wygasającym dostępem za 3 dni (okno ostrzegawcze + odwołanie z prośbą o przedłużenie).
     - Scenariusz C: Nieużywane repozytorium wygasłe całkowicie (brak jakichkolwiek zdarzeń).
     - Scenariusz D: Nowy developer bez dostępów (gotowy do przyjęcia standardu zespołu).

---

### Faza 2: Logika Domenowa i Endpointy API (Services & Routers)

1. **GitHub Mock Adapter & Router (`app/adapters/` & `app/api/`)**:
   - Implementacja portu `VCSProvider` w postaci `GitHubMockAdapter`.
   - Implementacja mocka w 100% zgodna z oficjalną dokumentacją GitHub REST API (dokładne schematy JSON, nagłówki, kody błędów `200`, `204`, `403`, `404`, formaty zdarzeń `PushEvent`, `PullRequestReviewEvent`, `IssueCommentEvent`).
   - Router emulujący oficjalne endpointy GitHuba v3:
     - `GET /api/v3/orgs/{org}/members`
     - `GET /api/v3/repos/{owner}/{repo}/collaborators`
     - `PUT /api/v3/repos/{owner}/{repo}/collaborators/{username}` (zmiana poziomu)
     - `DELETE /api/v3/repos/{owner}/{repo}/collaborators/{username}` (odebranie dostępu)
     - `GET /api/v3/repos/{owner}/{repo}/events` (strumień zdarzeń)
   - Strażnik *Last Admin Protection*: blokada operacji usuwającej ostatniego admina repo/organizacji (błąd 403 Forbidden).
2. **Lease Engine & Time Travel Service (`app/services/lease_service.py`)**:
   - Ewaluacja stanu dostępu w oparciu o strumień `ActivityEvent`:
     - `PushEvent` w oknie TTL $\rightarrow$ dostęp `write` aktywny.
     - Brak `PushEvent`, ale obecny `PullRequestReviewEvent`/`IssueCommentEvent` $\rightarrow$ propozycja deeskalacji `write` do `read`.
     - Brak zdarzeń $\rightarrow$ wygaśnięcie (odebranie dostępu).
   - Wyliczanie statusów: `ACTIVE` (>7 dni), `WARNING` (<= 7 dni), `EXPIRED` (<= 0 dni).
   - Endpoint `/api/v1/simulation/time-travel`: przesuwanie zegara o wybraną liczbę dni.
3. **Baseline Engine (`app/services/baseline_service.py`)**:
   - Wyliczanie standardu zespołu: repozytoria, w których >= 50% unikalnych członków zespołu wygenerowało rekord w `ActivityEvent` w okresie ostatnich 30 dni.
   - Proponowanie najniższego wymaganego poziomu (`write` lub `read`, nigdy `admin`).
4. **Appeals & Admin Decision Service (`app/services/appeal_service.py`)**:
   - Składanie odwołania przez użytkownika (wymóg unikalnego uzasadnienia).
   - Elastyczny wachlarz decyzji administratora:
     - Mnożnik bieżącego TTL: `1.5x`, `2x`.
     - Presety: `+7`, `+14`, `+30`, `+90` dni.
     - Custom: dowolna liczba dni lub data z kalendarza.
     - Deeskalacja (`write` $\rightarrow$ `read`) lub odebranie (`Revoke`).
   - Zapis każdego zdarzenia do nienaruszalnego rejestru audytowego (`AuditLog`).

---

### Faza 3: Frontend SPA (React 19 + shadcn/ui + React Flow)

1. **Inicjalizacja i konfiguracja frontendu**:
   - Vite + React 19 + React Compiler + Tailwind CSS + shadcn/ui.
   - Layout SPA: ciemny styl IT/Defence, TopBar z Time Travel Controllerem, Sidebar z nawigacją.
2. **Widok 1: Dashboard i Pasek Czasu (Simulation Bar)**:
   - Centralny licznik symulowanego czasu z przyciskami skoku (+7 dni, +25 dni, +35 dni, reset).
   - Karty KPI: Aktywne dostępy, Ostrzeżenia, Wygaśnięte, Rekomendacje deeskalacji (`write` -> `read`).
3. **Widok 2: Inwentarz Dostępów (Access Leases Table)**:
   - Tabela: Użytkownik, Zespół, Repozytorium, Przyznany poziom, Ostatni push/review, Pozostało dni, Status badge.
   - Szybkie akcje: Przedłuż, Zdeeskaluj do `read`, Odbierz.
4. **Widok 3: Centrum Ostrzeżeń i Odwołań (Appeals & Warnings)**:
   - Lista użytkowników w oknie ostrzegawczym.
   - Przegląd wniosków z uzasadnieniem biznesowym.
   - Modal decyzji administratora z ergonomią wyboru: przyciski mnożnika (`2x`), presety (`+7`, `+14`, `+30`) oraz pole custom dni/daty.
5. **Widok 4: Standard Zespołu (Team Baseline)**:
   - Prezentacja wyliczonego standardu dla DEV i QA na podstawie telemetrii zdarzeń.
   - Onboarding nowego developera: podgląd sugerowanych repozytoriów i zatwierdzenie 1 kliknięciem.
6. **Widok 5: Interaktywny Graf Uprawnień (React Flow)**:
   - Wizualizacja relacji: Użytkownicy -> Zespoły -> Repozytoria z kolorystyką statusów dostępu.
7. **Widok 6: Dziennik Audytowy (Audit Log)**:
   - Oś czasu zdarzeń z filtrem akcji człowieka vs reguł automatycznych.

---

### Faza 4: Integracja, Polerowanie Demo i Prezentacja

1. **Weryfikacja scenariuszy prezentacyjnych (Pitch Flow)**:
   - Krok 1: Pokazanie stanu wyjściowego (czysty dashboard, zielone dostępy).
   - Krok 2: Użycie Time Travel (+25 dni) -> pojawienie się żółtych ostrzeżeń i wniosku o przedłużenie.
   - Krok 3: Demonstracja odwołania i akcji admina (przedłużenie o `2x` lub deeskalacja z `write` do `read`).
   - Krok 4: Użycie Time Travel (+35 dni) -> wygaśnięcie nieużywanych dostępów.
   - Krok 5: Próba usunięcia ostatniego admina -> demonstracja zadziałania *Last Admin Protection*.
   - Krok 6: Podgląd audytu i grafu relacji.
