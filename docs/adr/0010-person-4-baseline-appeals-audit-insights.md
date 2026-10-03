# ADR 0010: Kontrakty Osoby 4 — standard zespołu, onboarding, odwołania, audyt i dane widoków

**Status:** Proponowany (do akceptacji zespołu) · **Autor:** Durczkos (Osoba 4) · **Data:** 2026-10-03
**Doprecyzowuje:** ADR 0005, ADR 0007 (pkt 5, 9), ADR 0009 · **Opiera się na:** kodzie w `main` po PR #5 (kroki 1.1–1.6)

## Kontekst

Osoba 4 odpowiada za kroki 4.1–4.6: standard zespołu, onboarding, odwołania, historię odwołań, audyt oraz gotowe dane dla dashboardu i grafu. Zasada podziału brzmi: „backend daje frontowi gotowe dane, przeglądarka nic nie liczy”.

Stan `main`:
- Kontrakt danych z ADR 0006–0009 jest gotowy: `Role`, tabela `teams`, `Lease.is_active`, `AuditLog.actor_id: int`, `details: dict`, migracje Alembic i typy TS generowane z `CONTRACT_*_MODELS`.
- **Nie ma** portu VCS ani mocka GitHuba. Gałąź `github_mock` Osoby 2 nie jest zrebase'owana na `main` i ma własny model danych.
- **Nie ma** silnika dzierżaw Osoby 3 (statusy, rekomendacje, decyzje).
- `DecisionAction` nie ma `REJECT`.
- `Settings` nie zna loginu administratora.

Żeby nie czekać na Osoby 2 i 3, kroki 4.1, 4.2, 4.3 (złożenie i odrzucenie), 4.4 i 4.5 muszą opierać się wyłącznie na tym, co jest w `main`, plus na wąskich, jawnie opisanych punktach styku.

## Decyzja

### 1. Pliki Osoby 4

| Plik | Krok |
| --- | --- |
| `app/domain/baseline_rules.py` | 4.1 |
| `app/domain/lease_window.py` (`WARNING_WINDOW_DAYS`, `days_remaining`) | 4.3 — Osoba 3 używa tego samego modułu zamiast własnej kopii |
| `app/domain/appeal_rules.py` | 4.3 |
| `app/domain/insights.py` | 4.6 |
| `app/ports/vcs_provider.py`, `app/adapters/database_vcs.py` | 4.2 (§3) |
| `app/services/errors.py`, `app/services/audit_service.py` | 4.5 — współdzielone (§2) |
| `app/services/baseline_service.py`, `appeal_service.py`, `insights_service.py` | 4.1–4.6 |
| `app/api/v1/router.py`, `app/api/v1/deps.py`, `app/api/v1/errors.py` | 4.5 — wspólna infrastruktura API v1; inni dopisują tylko `include_router` |
| `app/api/v1/audit.py`, `baseline.py`, `onboarding.py`, `appeals.py`, `dashboard.py`, `graph.py` | 4.1–4.6 |
| `alembic/versions/0002_audit_logs_append_only.py`, `0003_one_pending_appeal_per_lease.py` | 4.5, 4.3 |
| `tests/factories.py` | 4.5 — wspólne fabryki rekordów testowych |
| Dopiski w plikach Osoby 1: `AuditAction` w `app/domain/enums.py`, `admin_login` w `Settings`, DTO w `app/schemas/{audit,baseline,appeal}.py` i `app/schemas/insights.py`, rejestracja w `app/schemas/__init__.py` i `app/main.py` | 4.1–4.6 |

### 2. Interfejsy udostępniane innym

```python
# app/services/errors.py — routery v1 zamieniają go na {"detail": "..."}
class ServiceError(Exception):
    def __init__(self, status_code: int, detail: str) -> None: ...

# app/services/audit_service.py — JEDYNA droga zapisu do audit_logs (tylko flush; commit robi router)
async def write_audit_event(session, *, now: datetime, actor_type: ActorType, actor_id: int | None,
                            action: AuditAction, target: str, details: dict[str, Any] | None = None,
                            justification: str | None = None) -> AuditLog
def lease_target(owner: str, repo: str, login: str) -> str      # "owner/repo:login"

# app/api/v1/deps.py
SessionDep, ClockDep, SettingsDep, AdminIdDep (id użytkownika settings.admin_login), VCSDep

# app/domain/lease_window.py
WARNING_WINDOW_DAYS = 7
def days_remaining(expires_at: datetime | None, now: datetime) -> int | None   # ceil: 0 w dniu wygaśnięcia, potem ujemne
```

`AuditAction` (`app/domain/enums.py`): `LEASE_EXTENDED`, `LEASE_DOWNSCOPED`, `LEASE_REVOKED`, `APPEAL_SUBMITTED`, `APPEAL_REJECTED`, `BASELINE_APPLIED`, `TIME_TRAVEL`, `LAST_ADMIN_BLOCKED`, `DEMO_RESET`. Kolumna `audit_logs.action` zostaje tekstem (ADR 0007), ale zapis przyjmuje tylko enum. `actor_id` to `users.id`. Aktor `ADMIN` to użytkownik o loginie `Settings.admin_login` (domyślnie `seed_data.ADMIN_LOGIN`, czyli jedno źródło prawdy), bo MVP nie ma logowania. Aktor `SYSTEM` ma `actor_id = None`.

### 3. Port VCS i adapter tymczasowy

`app/ports/vcs_provider.py` definiuje `VCSProvider.set_permission(owner, repo, username, role: Role) -> None`. Onboarding nadaje dostęp wyłącznie przez ten port.

Do czasu scalenia mocka Osoby 2 (2.3) port implementuje `DatabaseVCSAdapter`, w którym „kolaborator” to wiersz `Lease` (ADR 0007 pkt 4). Adapter tworzy dzierżawę albo ją przywraca: `is_active = True`, `granted_at = now`, `expires_at = now + default_lease_duration_days`, a dla `admin` `NULL`.

Po scaleniu mocka Osoba 2 podmienia tylko `get_vcs_provider` w `app/api/v1/deps.py`. Usuwanie dostępu (`remove_collaborator`, `LastAdminError`) dopisują do portu Osoby 2 i 3 razem z ochroną ostatniego admina (3.4). Adapter tymczasowy odmawia (409) degradowania roli `admin`, bo nie ma ochrony ostatniego admina.

### 4. API v1

| Metoda i ścieżka | Body / query | Odpowiedź | Krok |
| --- | --- | --- | --- |
| `GET /api/v1/teams/{slug}/baseline` | — | `BaselineEntry[]` (posortowane po nazwie repo); 404 nieznany zespół | 4.1 |
| `GET /api/v1/onboarding/{login}` | — | `OnboardingProposal`; 404 nieznany login; 422 admin lub brak zespołu | 4.2 |
| `POST /api/v1/onboarding/{login}/apply` | — | 200 `OnboardingProposal` po nadaniu (`to_grant == []`) | 4.2 |
| `POST /api/v1/appeals` | `AppealCreate` | 201 `AppealOverview`; 422 puste lub powtórzone uzasadnienie; 409 dzierżawa nie kwalifikuje się albo ma już odwołanie `PENDING`; 404 | 4.3 |
| `POST /api/v1/appeals/{id}/reject` | `AppealRejectRequest {justification}` | `AppealOverview`; 409 już rozpatrzone; 404 | 4.3 |
| `POST /api/v1/appeals/{id}/decision` | `DecisionRequest` | `AppealOverview` — **po 3.6** (deleguje do decyzji Osoby 3) | 4.3C |
| `GET /api/v1/appeals` | `?login=&lease_id=&status=` | `AppealOverview[]`, najnowsze pierwsze; 404 nieznany login | 4.4 |
| `GET /api/v1/audit` | `?actor_type=&action=&actor_login=&target=&since=&until=&limit=` | `AuditEntry[]`, najnowsze pierwsze; 422 gdy `since > until` | 4.5 |
| `GET /api/v1/simulation/clock` | — | `SimulationClock {simulated_now, offset_days}`: który dzień demo pokazuje panel | dodatek |
| `GET /api/v1/dashboard/stats` | — | `DashboardStats` — **po 3.6** | 4.6 |
| `GET /api/v1/graph` | `?team=<slug>` | `PermissionGraph` — **po 3.6** | 4.6 |

Nowe DTO (rejestrowane w `CONTRACT_*_MODELS`, typy TS generowane według ADR 0009):

- `OnboardingProposal {user: UserRead, team: TeamRead, to_grant: BaselineEntry[], already_granted: BaselineEntry[]}`
- `AppealRejectRequest {justification}` — te same ograniczenia co w `AppealCreate`
- `AppealOverview` = `AppealRead` + `{user: UserRead, repository: RepositoryRead, lease_role, lease_expires_at, lease_is_active, days_remaining, recent_activity_count, previous_appeals}`
- `AuditEntry` = `AuditLogRead` + `{actor_login: str | null}`
- `SimulationClock {simulated_now, offset_days}`, np. `{"simulated_now": "2026-10-18T15:24:00Z", "offset_days": 15}`. Router `app/api/v1/simulation.py` jest wspólny: Osoba 2 dopisuje do niego `POST /simulation/time-travel` (2.5)
- `DashboardStats {generated_at, active, warning, expired, permanent, revoked, downscope_recommendations, revoke_recommendations, pending_appeals, onboarding_candidates}`
- `PermissionGraph {nodes: GraphNode[], edges: GraphEdge[]}`, `GraphNode {id, type: "team"|"user"|"repo", position: {x, y}, data: {label, team, is_admin}}`, `GraphEdge {id, source, target, label, animated, data: {kind: "membership"|"lease", role, status, recommendation}}` — format wprost do `<ReactFlow nodes edges />`

### 5. Reguły

1. **Standard zespołu (4.1):** członkowie = `team_id == T` i `is_admin == False`. Okno to `[now - 30 dni, now]`, obie granice włącznie. Repozytorium wchodzi, gdy `2 × aktywni >= członkowie`. Rola: `write`, gdy co najmniej połowa aktywnych ma w oknie zdarzenie `write`; w przeciwnym razie `read`; nigdy `admin` (pilnuje tego też walidator `BaselineEntry`).
2. **Onboarding (4.2):** zespół wynika z użytkownika. `to_grant` = pozycje standardu bez aktywnej (`is_active`) dzierżawy tej osoby, więc odebrany dostęp wraca do propozycji. Onboarding **nigdy nie podnosi** istniejącej aktywnej dzierżawy (np. `read` → `write`): podniesienie uprawnień to osobna, świadoma decyzja admina. `apply` jest idempotentne i zapisuje `BASELINE_APPLIED` (cel `slug:login`, `details.granted = {repo: rola}`) tylko wtedy, gdy coś nadano.
3. **Kwalifikacja odwołania (4.3):** odwołanie przysługuje, gdy dzierżawa jest nieaktywna (odebrana) albo gdy nie jest `admin` i do wygaśnięcia zostało `<= WARNING_WINDOW_DAYS` (także już wygasła). Ta reguła liczy na surowych polach `Lease`, więc nie czeka na statusy Osoby 3. Granica 7 dni pochodzi z `lease_window.py`, wspólnego z Osobą 3.
4. **Uzasadnienie (4.3):** puste po `strip` → 422 (Pydantic oraz serwis). Powtórzone po normalizacji (`strip`, zwinięcie białych znaków, `casefold`) względem **każdego** wcześniejszego odwołania tej osoby → 422 (ADR 0005, celowe tarcie). Najwyżej jedno `PENDING` na dzierżawę: sprawdza to serwis, a przy równoczesnych żądaniach dodatkowo częściowy unikalny indeks `uq_appeals_one_pending_per_lease` (migracja `0003`), co kończy się 409.
5. **Rozpatrzenie (4.3):** odrzucenie (`/reject`) nie zmienia dzierżawy, ustawia `REJECTED` i zapisuje `APPEAL_REJECTED`. Decyzja (`/decision`, po 3.6): `EXTEND` → `APPROVED`; `DOWNSCOPE`/`REVOKE` → `REJECTED` (użytkownik nie dostał przedłużenia, a akcję zapisuje audyt Osoby 3). Zawsze `resolved_at = now`. Decyzja Osoby 3 na dzierżawie z odwołaniem `PENDING` idzie przez `/appeals/{id}/decision`, bo frontend sprawdza to przez `GET /appeals?lease_id=&status=PENDING`.
6. **`previous_appeals`** liczy wcześniejsze odwołania tej osoby według `(created_at, id)`, bo przy zamrożonym zegarze symulacji czasy bywają równe. **`recent_activity_count`** to zdarzenia tej osoby w tym repo w oknie `default_lease_duration_days`. **`days_remaining`** w `AppealOverview` jest `null` dla odebranego dostępu.
7. **Audyt tylko do dopisywania (4.5):** migracja `0002` zakłada wyzwalacze SQLite `BEFORE UPDATE`/`BEFORE DELETE` na `audit_logs` z `RAISE(ABORT, 'audit_logs is append-only')`. Działają także na surowy SQL. Reset demo (`downgrade base` → `upgrade head`) działa, bo `downgrade` najpierw usuwa wyzwalacze, a `DROP TABLE` ich nie uruchamia. **Uwaga dla przyszłych migracji:** `batch_alter_table` na `audit_logs` odtwarza tabelę w SQLite i gubi wyzwalacze, więc taka migracja musi je założyć ponownie (pilnuje tego test `test_audit_logs_reject_raw_update_and_delete` na `head`).
8. **Filtry audytu (4.5):** `actor_type`, `action`, `actor_login` to równość. `target` to fragment bez rozróżniania wielkości liter, a `%` i `_` są dosłowne. `since`/`until` to daty ze strefą (zakres domknięty). `limit` mieści się w przedziale 1–1000, domyślnie 200. Sortowanie: `timestamp DESC, id DESC`.
9. **Liczniki dashboardu (4.6):** `revoked` = nieaktywne. `permanent` = aktywne `admin`. `active`/`warning`/`expired` = status Osoby 3 dla aktywnych dzierżaw nie-admin. Rekomendacje liczone tylko dla aktywnych dzierżaw nie-admin. `pending_appeals` = `PENDING`. `onboarding_candidates` = osoby z zespołem, bez flagi admina i bez aktywnej dzierżawy.
10. **Graf (4.6):** kolumny `x` = 0 / 320 / 640 (zespół / osoba / repo), `y = wiersz × 80`. Zespoły według `slug`; osoby według zespołu (bez zespołu na końcu), potem loginu; repozytoria alfabetycznie. Identyfikatory: `team:<slug>`, `user:<login>`, `repo:<name>`, `member:<login>`, `lease:<id>`. Krawędzie tylko dla aktywnych dzierżaw, a każda wskazuje istniejący węzeł. Z filtrem `team` graf zawiera tylko członków i repozytoria, do których mają dzierżawy. `animated = status ∈ {WARNING, EXPIRED}`; `label` = rola. Kolory dobiera frontend z `statusBadges.ts`.

### 6. Punkty styku z Osobą 3 (wymagane dopiero dla 4.3C i 4.6B)

```python
# app/services/lease_service.py (3.6)
async def list_lease_overviews(session, now: datetime) -> list[LeaseOverview]
# app/services/decision_service.py (3.6)
async def apply_lease_decision(session, vcs, *, lease: Lease, decision: DecisionRequest,
                               now: datetime, actor_id: int) -> Lease
```

Jeśli Osoba 3 wybierze inne nazwy, aktualizuje ten paragraf, a Osoba 4 dostosowuje wywołania w 4.3C/4.6B.

## Otwarte kwestie

- **O1 (Osoba 3):** świeżo nadana dzierżawa (onboarding) bez zdarzeń nie powinna od razu dostawać rekomendacji `REVOKE`, bo zawyża to licznik i podsuwa „Odbierz” nowej osobie. Propozycja: dla `granted_at > now - lease_days` bez zdarzeń zwracać `KEEP`. Szkic reguł do wykorzystania: `docs/superpowers/specs/archive/2026-10-03-draft-lease-rules-for-person-3.md`.
- **O2 (Osoba 3):** `LeaseStatus` ma trzy wartości. Status dzierżaw `admin` i nieaktywnych w `LeaseOverview` należy do Osoby 3. Liczniki z §5.9 go nie potrzebują.
- **O3 (Osoba 2):** `github_mock` musi zostać zrebase'owany na model z `main` (`Role`, `is_active` zamiast `DELETE`) i implementować `VCSProvider` z §3.
- **O4 (zespół):** ADR 0007 pkt 5 deklaruje append-only także dla `activity_events`. Wyzwalacze z §5.7 obejmują na razie tylko `audit_logs`, bo `activity_events` są w gestii Osoby 2.

## Konsekwencje

- Kroki 4.1, 4.2, 4.3A/B, 4.4, 4.5 i 4.6A powstają bez czekania na Osoby 2 i 3; 4.3C i 4.6B to cienkie dopięcia po 3.6.
- Osoby 2 i 3 dostają gotowy, wspólny zapis audytu, infrastrukturę API v1 i fabryki testowe.
- Każda zmiana DTO z §4 wymaga `scripts/export_contract.py` i regeneracji `frontend/src/types/api.ts` (ADR 0009).
