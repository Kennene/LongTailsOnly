# ADR 0006: Kontrakty współdzielone dla pracy równoległej

## Status

Proponowany (2026-10-03) — do zatwierdzenia przez zespół **przed** rozpoczęciem Zadań 2–19.

## Kontekst

Zespół realizuje zadania z planu `docs/superpowers/plans/2026-10-03-github-access-lease-governor.md` równolegle. Ten plan:

- powstał przed rewizją ADR 0002 i nadal opisuje 5-stopniową hierarchię ról (`admin > maintain > push > triage > pull`), odnawianie roli `admin` oraz down-scope `admin → push` (Zadania 4, 5, 8, 19), czyli rzeczy, których ADR 0002 już nie przewiduje;
- podaje ścieżki plików niezgodne z `CODING_STANDARDS.md` (np. `services/github_mock_service.py` zamiast `adapters/`, `frontend/src/pages/` i `src/api/` zamiast `src/components/<feature>/` i `src/lib/`);
- nie definiuje współdzielonych nazw (enumy, pola modeli, DTO API, fixture'y testowe), więc każdy, kto pracuje równolegle, wymyśliłby je po swojemu;
- pomija elementy P0 z `PRODUKT.md`: tryb egzekwowania `warning`/`auto` (M4), endpoint onboardingu z baseline'u (UC-1), listę odwołań dla widoku (UC-3) i odczyt zegara.

## Decyzja

### 1. Hierarchia źródeł prawdy

ADR-y (0001–0007) > `CODING_STANDARDS.md` > plany per zadanie (`docs/superpowers/plans/2026-10-03-task-NN-*.md`) > plan główny. Plan główny pozostaje mapą zadań. Ich treść wiążąca jest w planach per zadanie.

### 2. Kolejność scalania i zależności

- **Zadanie 1 (szkielet + kontrakty)** trafia do `main` jako pierwsze, możliwie szybko. Zawiera enumy domenowe, porty i konfigurację testów, od których zależy reszta backendu.
- **Zadanie 12 (szkielet frontendu + typy API + klient)** trafia do `main` jako pierwsze z frontendu. Opiera się wyłącznie na kontraktach z tego ADR, więc może powstawać równolegle z backendem.
- Rdzeń logiki domenowej jest **czystymi funkcjami** w `app/domain/` (bez bazy i bez FastAPI). Zadania 8, 9 i 10 mogą więc pisać i testować reguły zaraz po Zadaniu 1, nie czekając na modele z Zadania 3.
- Gałęzie: `feat/task-NN-<krótki-opis>`. Jedno zadanie to jeden PR do `main`.

### 3. Struktura backendu (właściciel w nawiasie)

```
backend/app/
├── main.py                    create_app() + app                          [1; 6, 11 dopisują routery]
├── core/config.py             Settings                                    [2]
├── core/time_provider.py      TimeProvider (implementuje ClockPort)       [2]
├── domain/enums.py            wszystkie enumy z §4                        [1]
├── domain/roles.py            ranking ról, mapowanie na GitHub API        [5]
├── domain/lease_rules.py      status, rekomendacja, odnawianie            [8]
├── domain/baseline_rules.py   algorytm 50%                                [9]
├── domain/extension.py        mnożnik / dni / data                        [10]
├── ports/clock.py             ClockPort                                   [1]
├── ports/vcs_provider.py      VCSProvider + LastAdminError                [1]
├── adapters/github_mock.py    GitHubMockAdapter (VCSProvider na bazie)    [6 odczyty, 7 mutacje]
├── db/base.py, db/types.py, db/session.py                                 [3]
├── db/seed_data.py, db/seed.py                                            [4]
├── models/*.py                                                            [3]
├── schemas/github.py                                                      [5]
├── schemas/api.py             DTO API v1 z §6                             [5]
├── services/lease_service.py                                              [8]
├── services/baseline_service.py                                           [9]
├── services/audit_service.py, services/decision_service.py, services/appeal_service.py  [10]
├── api/deps.py                                                            [6; 11 dopisuje]
├── api/github_mock/router.py                                              [6, 7]
└── api/v1/*.py                                                            [11]
```

### 4. Enumy (`app/domain/enums.py`, `StrEnum`)

| Enum | Wartości |
| --- | --- |
| `Team` | `DEV`, `QA` |
| `Permission` | `admin`, `write`, `read` |
| `ActionType` | `PushEvent`, `PullRequestReviewEvent`, `IssueCommentEvent` |
| `LeaseStatus` | `ACTIVE`, `WARNING`, `EXPIRED`, `PERMANENT`, `REVOKED` |
| `Recommendation` | `KEEP`, `DOWNSCOPE`, `REVOKE` |
| `AppealStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `ActorType` | `ADMIN`, `USER`, `SYSTEM` |
| `DecisionAction` | `EXTEND`, `DOWNSCOPE`, `REVOKE`, `REJECT` |
| `EnforcementMode` | `warning`, `auto` |
| `AuditAction` | `LEASE_EXTENDED`, `LEASE_DOWNSCOPED`, `LEASE_REVOKED`, `APPEAL_SUBMITTED`, `APPEAL_REJECTED`, `BASELINE_APPLIED`, `TIME_TRAVEL`, `POLICY_CHANGED`, `LAST_ADMIN_BLOCKED` |

Mapowanie zdarzeń na uprawnienia: `PushEvent → write`, `PullRequestReviewEvent → read`, `IssueCommentEvent → read` (ADR 0002). Jedno źródło: `EVENT_PERMISSION` w `app/domain/enums.py`.

### 5. Modele ORM (Zadanie 3)

Wszystkie kolumny czasu używają `UTCDateTime` (`app/db/types.py`) — `TypeDecorator`, który zapisuje UTC i **zawsze zwraca `datetime` ze strefą UTC** (aiosqlite zwraca naiwne daty, a to psuje porównania z zegarem).

| Model | Pola |
| --- | --- |
| `User` | `id: int` PK, `login: str` unique, `name: str`, `team: Team \| None`, `is_admin: bool = False` |
| `Repository` | `id: int` PK, `name: str` unique, `owner: str`, `default_branch: str = "main"`, `default_lease_days: int = 30` |
| `Lease` | `id: int` PK, `user_id` FK idx, `repo_id` FK idx, `current_role: Permission`, `granted_at`, `expires_at: datetime \| None` (`None` ⇔ `admin`), `revoked_at: datetime \| None`; `UniqueConstraint(user_id, repo_id)` |
| `ActivityEvent` | `id: int` PK, `user_id` FK idx, `repo_id` FK idx, `timestamp`, `action_type: ActionType`, `required_permission: Permission` |
| `Appeal` | `id: int` PK, `lease_id` FK idx, `user_id` FK, `repo_id` FK, `requested_role: Permission`, `justification: str`, `status: AppealStatus = PENDING`, `created_at`, `resolved_at: datetime \| None` |
| `AuditLog` | `id: int` PK, `timestamp`, `actor_type: ActorType`, `actor_id: str \| None` (login), `action: AuditAction`, `target: str`, `details: str \| None`, `justification: str \| None` |

`Lease` nie przechowuje `last_activity_*` — ostatnią aktywność wylicza się z `ActivityEvent`. Odebrany dostęp nie jest usuwany, tylko dostaje `revoked_at`, dzięki czemu historia i odwołania zostają. Kolaborator w mocku GitHuba to dostęp z `revoked_at IS NULL`.

### 6. Porty

```python
class ClockPort(Protocol):
    def get_current_time(self) -> datetime: ...

class VCSProvider(Protocol):
    async def set_permission(self, owner: str, repo: str, username: str, permission: Permission) -> None: ...
    async def remove_collaborator(self, owner: str, repo: str, username: str) -> None: ...

class LastAdminError(Exception): ...
```

Nazwa metody zegara to `get_current_time()` (zgodnie z `CODING_STANDARDS.md` i Zadaniem 2). Zapis `time_provider.now()` w ADR 0003 oznacza tę samą operację. `VCSProvider` rzuca `LastAdminError`, gdy operacja zostawiłaby repozytorium bez admina. Serwisy domenowe zmieniają uprawnienia **wyłącznie** przez `VCSProvider`, nigdy przez bezpośredni zapis do `Lease.current_role`.

### 7. API v1 (Zadanie 11; DTO w `app/schemas/api.py` — Zadanie 5; typy TS w `frontend/src/types/api.ts` — Zadanie 12)

Daty w JSON: ISO 8601 z `Z`/`+00:00`. Błędy: kod HTTP + `{"detail": "<komunikat>"}`.

> ADR 0008 §4 rozszerza tę tabelę (filtry `GET /appeals` i `GET /audit`, onboarding, dashboard, graf) i zastępuje `POST /baseline/{team}/apply` endpointem `POST /onboarding/{login}/apply`.

| Metoda i ścieżka | Body | Odpowiedź |
| --- | --- | --- |
| `GET /api/v1/simulation/clock` | — | `ClockView {now, offset_days}` |
| `POST /api/v1/simulation/time-travel` | `TimeTravelRequest {days: int = 0, reset: bool = false}` | `ClockView` |
| `GET /api/v1/policy` | — | `PolicyView {mode, lease_days, warning_days}` |
| `PUT /api/v1/policy` | `PolicyUpdate {mode}` | `PolicyView` |
| `GET /api/v1/users` | — | `UserView[] {id, login, name, team, is_admin, active_lease_count}` |
| `GET /api/v1/leases` | — | `LeaseView[]` |
| `POST /api/v1/leases/{id}/decision` | `LeaseDecisionRequest` | `LeaseView`; 403 przy `LastAdminError` |
| `GET /api/v1/appeals` | — | `AppealView[]` |
| `POST /api/v1/appeals` | `AppealCreate {lease_id, justification}` | 201 `AppealView`; 422 przy pustym/powtórzonym uzasadnieniu; 409 przy złym stanie |
| `POST /api/v1/appeals/{id}/decision` | `AppealDecisionRequest` | `AppealView` |
| `GET /api/v1/baseline/{team}` | — | `BaselineView` |
| `POST /api/v1/baseline/{team}/apply` | `BaselineApplyRequest {login}` | 201 `LeaseView[]` |
| `GET /api/v1/audit` | — | `AuditLogView[]` (najnowsze pierwsze) |

Pola DTO:

- `UserRef {id, login, name, team}`, `RepoRef {id, name, owner}`
- `LeaseView {id, user: UserRef, repo: RepoRef, role, granted_at, expires_at, days_remaining, status, recommendation, last_activity_at, last_activity_type}`
- `LeaseDecisionRequest {action: EXTEND|DOWNSCOPE|REVOKE, multiplier?: float (1 < x ≤ 4), days?: int (1–365), until?: datetime, justification: str (≥ 1 znak po strip)}`. Dla `EXTEND` dokładnie jedno z `multiplier`/`days`/`until`, dla pozostałych akcji żadne.
- `AppealDecisionRequest` — jak wyżej, ale `action` może też być `REJECT`.
- `AppealView {id, lease_id, user, repo, requested_role, justification, status, created_at, resolved_at, lease_status, days_remaining, recent_activity_count, previous_appeals}`
- `BaselineView {team, member_count, window_days, entries: BaselineEntryView[]}`, `BaselineEntryView {repo: RepoRef, active_members, proposed_role}`
- `AuditLogView {id, timestamp, actor_type, actor_id, action, target, details, justification}`

Mock GitHuba (`/api/v3/...`, Zadania 6–7) ma osobny format błędów zgodny z GitHubem (ADR 0004): `{"message", "documentation_url"}`.

### 8. Konfiguracja testów (backend)

- `pytest` + plugin `anyio` (instalowany razem z FastAPI). Testy async mają `pytestmark = pytest.mark.anyio`, a fixture `anyio_backend` zwracający `"asyncio"` jest w `tests/conftest.py` (Zadanie 1).
- Fixture `session` (in-memory aiosqlite, `StaticPool`) i fabryki rekordów w `tests/factories.py` dostarcza Zadanie 3. Fixture `client` (`httpx.AsyncClient` + `ASGITransport` z nadpisaną sesją) jest w `tests/api/conftest.py` (Zadanie 6).
- Każdy podkatalog `tests/` ma pusty `__init__.py`. Identyczne puste pliki dodane na dwóch gałęziach scalają się bez konfliktu.
- Lint: `ruff check .` i `ruff format --check .` (zależność dev z Zadania 1).

### 9. Struktura frontendu (zgodnie z `CODING_STANDARDS.md` §3)

```
frontend/src/
├── types/api.ts                         typy z §7                       [12]
├── lib/apiClient.ts, lib/dateTime.ts, lib/statusBadges.ts, lib/utils.ts [12]
├── hooks/useApiResource.ts, hooks/SimulationContext.tsx                 [12]
├── components/ui/*                      shadcn/ui                       [12]
├── components/layout/TimeTravelBar.tsx                                  [12]
├── components/layout/AppShell.tsx, Sidebar.tsx, TopBar.tsx, views.tsx   [13]
├── components/dashboard/DashboardPage.tsx                               [13]
├── components/leases/*                                                  [14]
├── components/appeals/*                                                 [15]
├── components/baseline/*                                                [16]
├── components/graph/*                                                   [17]
└── components/audit/*                                                   [18]
```

- Nawigacja bez routera: `views.tsx` (rejestr widoków) i stan w `AppShell`. Zadania 14–18 dopisują po jednej pozycji do rejestru. Konflikt przy scalaniu rozwiązujemy, zostawiając obie linie.
- Testy: Vitest + Testing Library + jsdom. Komponenty testujemy, mockując `@/lib/apiClient` (`vi.mock`), bez sieci.
- Dev server Vite przekierowuje `/api` na `http://localhost:8000`.

## Konsekwencje

- Zadania 2–11 i 13–18 mogą powstawać równolegle po scaleniu Zadań 1 i 12. Konflikty ograniczają się do dopisywania linii (`main.py`, `deps.py`, `views.tsx`).
- Zadania 8, 9 i 10 mogą zacząć od czystych funkcji domenowych, zanim Zadanie 3 trafi do `main`.
- Plan główny wymaga adnotacji, że wiążące są plany per zadanie (rozbieżności opisane wyżej).
- Zmiana kontraktu z tego ADR wymaga aktualizacji ADR i poinformowania właścicieli zależnych zadań.
