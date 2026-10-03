# Osoba 6 — Fixtures, scenariusze, testy E2E, straż ADR-ów — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zamrozić dane, na których frontend może budować widoki (5.3–5.10) zanim powstaną endpointy pod te widoki, opisać scenariusze UC-1…UC-5 jako wykonywalne dane i uruchomić na nich testy end-to-end, przy procesowym pilnowaniu ADR-ów w każdym PR.

**Architecture:** Fixtures i scenariusze to **dane zgodne z generowanym kontraktem**, nie drugi kontrakt. Kontrakt ma jedno źródło prawdy — modele Pydantic z `backend/app/schemas/` eksportowane przez ADR 0009 do `backend/contract/schema.json` i generowane do `frontend/src/types/api.ts`. Fixtures mieszkają w `shared/fixtures/` i są walidowane **tymi samymi modelami Pydantic**, które generują kontrakt — bez nowych zależności. Testy E2E ponownie wykorzystują istniejący harness z `backend/tests/conftest.py` (`httpx.AsyncClient` + `ASGITransport` + świeża baza w `tmp_path`) i są parametryzowane plikami scenariuszy.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2.0 (async SQLite), Pydantic v2, pytest + pytest-asyncio + httpx — wszystko już obecne w `backend/pyproject.toml`. Zero nowych zależności.

**Spec:** `PRODUKT.md` (UC-1…UC-5, §4 zakres MVP), `PLAN.md` (faza 4, pitch flow), `docs/adr/0001`–`0012`, plan zespołowy (kroki 6.0–6.3). Ogólny plan implementacji: `docs/superpowers/plans/2026-10-03-github-access-lease-governor.md`.

## Stan wyjściowy (zweryfikowany)

- `backend/` na `main` (`beb7a06`) jest **zielony**: `73 passed`.
- Kontrakt ma **22 definicje** w `backend/contract/schema.json`. Nazwy pól w `snake_case`.
- `Recommendation` = `KEEP | DOWNSCOPE | REVOKE` (**nie** `NONE`).
- `LeaseOverview` niesie gotowe `status`, `days_remaining`, `last_activity_at`, `recommendation` oraz zagnieżdżone `user: UserRead` i `repository: RepositoryRead`. To realizuje zasadę „backend daje frontowi gotowe dane".
- `backend/app/api/v1/` zawiera **wyłącznie `demo.py`**. Endpointy pod widoki (3.6, 4.x) jeszcze nie istnieją — to jest powód istnienia fixtures.
- `backend/tests/conftest.py` udostępnia fixtures `engine`, `session`, `client`. **Nie budujemy ich ponownie.**
- `frontend/` zawiera tylko `src/types/api.ts` (generowany). Brak `package.json` i `vite.config.ts` — szkielet powstanie w 5.1.
- `docs/adr/` ma 0001–0009 autorstwa Osoby 1 (bez indeksu).

## Global Constraints

Wartości skopiowane dosłownie ze specyfikacji. Wymagania każdego zadania obejmują ten rozdział domyślnie.

- Python `>=3.14`; FastAPI + SQLAlchemy 2.0 (async SQLite, `aiosqlite`) + Pydantic v2. *(`backend/pyproject.toml`, ADR 0001)*
- Twardy limit **max 300 linii na plik**; powyżej — podział na podmoduły. *(`CODING_STANDARDS.md` §1.1)*
- Zegar wyłącznie przez `time_provider.get_current_time()`. Nazwa `now()` **nie jest używana**; bezpośrednie `datetime.now()` w logice domenowej jest zabronione. *(ADR 0008 pkt 1, ADR 0003)*
- Domyślny TTL **30 dni**, okno ostrzegawcze **7 dni**, `LEASE_DURATION_DAYS = 30`. *(ADR 0002, `app/db/seed_data.py`)*
- Hierarchia: `write` > `read`. Aktywność `write` odnawia `write` i `read`; aktywność `read` **nie odnawia** `write`. Rola `admin` nie podlega wygasaniu i jest chroniona regułą Last Admin Protection → `403`. *(ADR 0002, ADR 0004)*
- Zdarzenia: `PushEvent` → `write`; `PullRequestReviewEvent`, `IssueCommentEvent` → `read`. *(`app/domain/enums.py: ActionType`)*
- Standard zespołu: ≥ **50%** unikalnych członków zespołu aktywnych w ostatnich **30 dniach**; najniższy wystarczający poziom; `admin` **nigdy** automatycznie. *(ADR 0005)*
- Schematy Pydantic i enumy są **źródłem prawdy kontraktu**. Po każdej ich zmianie regenerujemy `contract/schema.json` i `frontend/src/types/api.ts`; `frontend/src/types/api.ts` nie jest edytowany ręcznie. *(ADR 0009)*
- `TimeTravelRequest.days` przyjmuje **1–365**; `Extension` przyjmuje dokładnie jeden z: `preset_days` ∈ {7,14,30,90}, `multiplier` ∈ {1.5, 2.0}, `custom_days` ∈ 1–365, `until_date`. *(ADR 0005, `contract/schema.json`)*
- Odwołanie wymaga nowego, niepowtarzalnego uzasadnienia (`justification`, 1–2000 znaków). *(ADR 0005, `AppealCreate`)*
- Populacja demo pochodzi z `app/db/seed_data.py`: `tomasz-admin`, `kamil`, `marta`, `nowy-dev`, 10 repozytoriów. Fixtures i scenariusze nie wymyślają własnej populacji.
- Testy przed kodem (RED-GREEN-REFACTOR); twierdzenia o ukończeniu wyłącznie na podstawie świeżego wyniku polecenia. *(`AGENTS.md`)*
- Polecenia uruchamiamy z `backend/`. Gdy `uv` jest dostępne: `uv run pytest`; w tym środowisku `uv` nie ma, więc zweryfikowany wariant to `.\.venv\Scripts\python.exe -m pytest`.

## Review Focus

Klasy danych i tryby awarii, których specyfikacja wprost nie rozstrzyga, a które najpewniej uderzą użytkownika. Każda pozycja ma test w zadaniu będącym właścicielem danego kodu.

1. **Dryf fixtures wobec kontraktu** — Osoba 1 zmienia nazwę pola lub wartość enuma, kontrakt się regeneruje, a fixtures zostają na starych wartościach; frontend dostaje `undefined` w komórce zamiast błędu. → Task 2: `test_every_fixture_validates_against_its_contract_model`.
2. **Niespójny graf fixtures** — dzierżawa wskazuje `user.id` spoza `users.json`; JSON jest poprawny składniowo, więc nic nie krzyczy, a tabela i graf renderują puste komórki. → Task 2: `test_fixture_references_resolve_inside_fixture_set`.
3. **Wyciek zegara systemowego do wyniku scenariusza** — status policzony z `datetime.now()` zamiast `TimeProvider` sprawia, że ten sam scenariusz przechodzi dziś, a pada za miesiąc. → Task 4: `test_scenario_results_do_not_depend_on_wall_clock`.
4. **Polskie znaki i BOM** — nazwy i uzasadnienia zawierają `ż/ó/ś/ę` (`Rafał`, `Sylwia`); plik z BOM wywala `JSON.parse` we Vite i `json.load`, a zapisany w Windows-1252 zamienia znaki na `?`. → Task 2: `test_fixtures_are_utf8_without_bom`, Task 3: `test_scenarios_are_utf8_without_bom`.
5. **Pusty scenariusz Last Admin** — UC-5 zaczyna się od jednego administratora, więc próba odebrania i tak musiałaby zostać odrzucona; test przechodzi nawet gdy straż ostatniego admina jest zepsuta. → Task 3: `test_last_admin_scenario_starts_with_two_admins`.

## Nowe ADR-y

Napisane w tej sesji, numeracja **0010+** — 0006–0009 zajęła Osoba 1 (kolizja numerów 0006–0008 została wykryta przy scalaniu `main`).

| ADR | Decyzja | Implementuje |
| --- | --- | --- |
| [0010](../../adr/0010-fixtures-zgodne-z-generowanym-kontraktem.md) | Fixtures to dane zgodne z generowanym kontraktem, walidowane modelem Pydantic; koperta paginacyjna odłożona | Task 2 |
| [0011](../../adr/0011-scenariusze-demo-jako-dane.md) | Scenariusze UC-1…UC-5 jako wykonywalne dane w `shared/scenarios/` | Task 3, 4 |
| [0012](../../adr/0012-prelint-i-straz-adr-w-procesie-pr.md) | Prelint jako pamięć decyzji, straż ADR-ów, indeks ADR-ów, sprawdzenia repo-owe w `backend/tests/repo/` | Task 1 |

## Struktura plików

| Ścieżka | Odpowiedzialność |
| --- | --- |
| `shared/fixtures/manifest.json` | Spis fixtures: `id`, `file`, `shape`, `model`, `kind`, `consumedBy`, `status` |
| `shared/fixtures/*.json` | 11 plików danych zgodnych z `$defs` |
| `shared/fixtures/README.md` | Instrukcja konsumpcji (alias `@shared`) i opis `manifest.json` |
| `shared/scenarios/*.json` | 5 scenariuszy UC-1…UC-5 |
| `shared/scenarios/README.md` | Kształt scenariusza + kontrakt dla generatora Osoby 2 (2.6) |
| `backend/tests/repo/` | Sprawdzenia repo-owe: indeks ADR-ów, szablon PR, `.mcp.json`, `.gitignore` |
| `backend/tests/contract/` | Walidacja fixtures modelami Pydantic z kontraktu |
| `backend/tests/scenarios/` | Walidacja scenariuszy jako danych |
| `backend/tests/integration/` | Testy E2E scenariuszy (6.3) |
| `.github/pull_request_template.md` | Lista kontrolna PR ze strażą ADR-ów |
| `docs/adr/README.md` | Indeks ADR-ów |

Świadomie **nie** tworzymy: drugiego schematu kontraktu, projektu `tools/` (backend już istnieje), pliku JSON Schema dla scenariuszy (testy są jedynym strażnikiem), własnego harnessu HTTP (istnieje w `conftest.py`).

---

## Faza A — odblokowanie frontendu (bez nowych endpointów)

### Task 1: Higiena repo, Prelint i straż ADR-ów (krok 6.0)

**Files:**
- Modify: `backend/tests/repo/__init__.py` (Create)
- Create: `backend/tests/repo/test_docs_integrity.py`
- Track: `.mcp.json` (już utworzony, obecnie untracked)
- Create: `.github/pull_request_template.md` (już utworzony)
- Create: `.gitignore` (już utworzony)
- Create: `docs/adr/README.md` (już utworzony, indeks 0001–0012)
- Consumes: `docs/adr/0012-prelint-i-straz-adr-w-procesie-pr.md`
- Produces: komenda `cd backend; .\.venv\Scripts\python.exe -m pytest tests/repo -q` działająca bez nowych zależności

**Interfejs:** testy czytają pliki spoza `backend/`, wyliczając katalog główny jako `Path(__file__).resolve().parents[3]`.

- [ ] **Step 1: Napisz testy `backend/tests/repo/test_docs_integrity.py`**

```python
REPO_ROOT = Path(__file__).resolve().parents[3]

def test_every_adr_file_is_listed_in_index():
    # każdy docs/adr/NNNN-*.md poza README.md występuje po nazwie w docs/adr/README.md

def test_adr_numbers_are_unique():
    # brak dwóch plików z tym samym numerem NNNN

def test_every_index_entry_points_to_an_existing_file():
    # każdy link [NNNN](NNNN-*.md) w README.md wskazuje istniejący plik

def test_pull_request_template_requires_adr_check():
    # .github/pull_request_template.md zawiera linię pasującą do r"- \[ \] .*ADR"

def test_mcp_config_declares_prelint_server():
    # json.load(.mcp.json)["mcpServers"]["prelint"]["url"] jest niepustym https URL

def test_gitignore_excludes_python_and_node_artifacts():
    # .gitignore zawiera: __pycache__/, .venv/, .pytest_cache/, node_modules/
```

- [ ] **Step 2: Uruchom testy, żeby zobaczyć porażkę**

Run z `backend/`: `.\.venv\Scripts\python.exe -m pytest tests/repo -q`
Expected: FAIL — katalog `tests/repo/` nie istnieje, więc pytest nie zbiera żadnych testów (exit code 5). Po utworzeniu pliku: przejdą wszystkie poza `test_adr_numbers_are_unique`, dopóki nie potwierdzimy numeracji.

- [ ] **Step 3: Utwórz pakiet i uzupełnij braki**

Utwórz `backend/tests/repo/__init__.py`. Zweryfikuj, że `.mcp.json`, `.github/pull_request_template.md`, `.gitignore` i `docs/adr/README.md` istnieją i mają treść z tej sesji.

- [ ] **Step 4: Uruchom testy ponownie**

Run z `backend/`: `.\.venv\Scripts\python.exe -m pytest tests/repo -q`
Expected: PASS — 6 testów.

- [ ] **Step 5: Uruchom cały zestaw backendu, żeby nic nie zepsuć**

Run z `backend/`: `.\.venv\Scripts\python.exe -m pytest -q`
Expected: PASS — 79 testów (73 z `main` + 6 nowych).

- [ ] **Step 6: Zapisz decyzję do Prelinta**

Wyślij treść ADR 0012 w całości: śledzenie `.mcp.json`, lista kontrolna ADR w PR, indeks ADR-ów, sprawdzenia repo-owe w `backend/tests/repo/` zamiast osobnego projektu `tools/`, oraz reguła sprawdzania `origin/main` przed nadaniem numeru ADR-a — wraz z uzasadnieniem (kolizja 0006–0008) i odrzuconą opcją osobnego projektu `tools/`.

- [ ] **Step 7: Commit**

```bash
git add .mcp.json .github .gitignore docs/adr backend/tests/repo
git commit -m "chore(6.0): prelint wiring, ADR guard, ADR index, repo hygiene checks"
```

---

### Task 2: Fixtures JSON zgodne z kontraktem (krok 6.1)

**Files:**
- Create: `shared/fixtures/manifest.json`
- Create: `shared/fixtures/README.md`
- Create: `shared/fixtures/users.json`, `teams.json`, `repositories.json`, `leases.json`,
  `activity.json`, `baseline.json`, `appeals.json`, `audit.json`, `clock.json`,
  `demo-reset.json`, `decision-requests.json`
- Create: `backend/tests/contract/__init__.py`, `backend/tests/contract/test_fixtures_match_contract.py`
- Consumes: `backend/contract/schema.json` (ADR 0009), `app/schemas/__init__.py::CONTRACT_REQUEST_MODELS` i `CONTRACT_RESPONSE_MODELS`, `app/db/seed_data.py`
- Produces: `manifest.json` z wpisami `{id, file, shape, model, kind, consumedBy, status}`; kontrakt Task 3 na nazwy pól `LeaseOverview`

**Interfejs — wpis manifestu:**
```json
{
  "id": "leases",
  "file": "leases.json",
  "shape": "list",
  "model": "LeaseOverview",
  "kind": "response",
  "consumedBy": ["frontend:5.3", "frontend:5.4", "frontend:5.5"],
  "status": "provisional"
}
```

**Interfejs — zawartość pliku:** lista obiektów danego modelu (`shape: "list"`) albo pojedynczy obiekt (`shape: "single"`). Bez koperty.

- [ ] **Step 1: Napisz testy `backend/tests/contract/test_fixtures_match_contract.py`**

```python
def test_manifest_lists_every_fixture_file_and_every_file_is_listed():
    # relacja dwukierunkowa: manifest.json <-> pliki *.json w shared/fixtures/

def test_every_fixture_validates_against_its_contract_model(entry):
    # model = getattr(app.schemas, entry["model"]); dla shape=="list":
    #   [model.model_validate(item) for item in body]
    # dla shape=="single": model.model_validate(body)

def test_fixture_references_resolve_inside_fixture_set():
    # każdy lease.user.id, lease.repository.id, appeal.user_id, appeal.lease_id,
    # apel.repo_id, activity.user_id, activity.repo_id istnieje w users/repositories/leases

def test_lease_fixtures_cover_all_statuses_roles_and_recommendations():
    # co najmniej jeden ACTIVE, WARNING, EXPIRED; co najmniej jeden write i read;
    # co najmniej jeden KEEP, DOWNSCOPE i REVOKE

def test_lease_fixtures_include_a_null_days_remaining_case():
    # days_remaining dopuszcza null (LeaseOverview), więc fixtures muszą pokryć ten przypadek

def test_fixture_dates_are_timezone_aware():
    # każdy *_at parsuje się jako datetime z tzinfo, nie naive

def test_fixtures_are_utf8_without_bom():
    # każdy plik czytany jako bytes nie zaczyna się od b"\xef\xbb\xbf" i dekoduje się jako UTF-8

def test_polish_names_survive_roundtrip():
    # "Rafał" i "Sylwia" z seeda są w fixtures i przechodzą json.loads(json.dumps(...)) bez zmiany

def test_fixtures_use_seed_population_logins():
    # każdy login w fixtures należy do zbioru loginów z app/db/seed_data.py
    # (tomasz-admin, kamil, marta, nowy-dev, TEAM_MEMBERS, REGULAR_DEVS, REGULAR_QA)

def test_manifest_entries_declare_known_shape_and_consumers():
    # shape ∈ {list, single}; consumedBy niepuste, więc widać, kto czyta dany plik
```

Uwaga: `test_every_fixture_validates_against_its_contract_model` jest parametryzowany po `manifest.json`, więc nowy wpis automatycznie dostaje walidację.

Uwaga o Last Admin Protection: planowany wcześniej test `test_last_admin_fixtures_expose_a_removable_admin_scenario` został **usunięty**. `app/db/seed.py` nadaje rolę `admin` wyłącznie `tomasz-admin` — po jednym na repozytorium, z `expires_at = NULL`. Fixtures nie mogą więc pokazać repozytorium z dwoma adminami bez rozjechania się z seedem. Przypadek „dwóch adminów" powstaje **akcją** w scenariuszu UC-5 (Task 3): najpierw `PUT` nadaje drugiego admina, potem `DELETE` jednego przechodzi, a `DELETE` ostatniego zwraca `403`. Weryfikacja straży należy do Task 4, nie do Task 2.

- [ ] **Step 2: Uruchom testy, żeby zobaczyć porażkę**

Run z `backend/`: `.\.venv\Scripts\python.exe -m pytest tests/contract -q`
Expected: FAIL — `shared/fixtures/manifest.json` nie istnieje.

- [ ] **Step 3: Napisz `manifest.json` i 11 plików fixtures**

Dane odwzorowują `app/db/seed_data.py`: `tomasz-admin` (admin w 10 repo), `kamil` (DEV — `write` w `core-api` i `auth-service` z codziennymi pushami; `write` w `payment-service` z pushem 25 dni temu i review 2 dni temu → `DOWNSCOPE`; `write` w `frontend-app` i `notifications` tylko review/comment → `DOWNSCOPE`; `write` w 5 repozytoriach bez zdarzeń → `REVOKE`), `marta` (QA — `read` w `qa-automation` i `frontend-app`), `nowy-dev` (bez dzierżaw), 10 repozytoriów z `REPOSITORIES`.
`decision-requests.json` (`kind: "request"`, `model: "DecisionRequest"`) pokrywa każdy wariant `Extension`: `preset_days: 30`, `multiplier: 2.0`, `custom_days: 45`, `until_date: "2026-12-31"` oraz akcje `DOWNSCOPE` i `REVOKE`.
`README.md` zawiera opis `manifest.json` oraz gotowy fragment konfiguracji Vite:
```ts
resolve: { alias: { '@shared': path.resolve(__dirname, '../shared') } },
server: { fs: { allow: ['..'] } }
```

- [ ] **Step 4: Uruchom testy ponownie**

Run z `backend/`: `.\.venv\Scripts\python.exe -m pytest tests/contract -q`
Expected: PASS — 10 testów plus przypadki parametryzowane (11 wpisów manifestu).

- [ ] **Step 5: Sprawdź limit 300 linii**

Sprawdź długość każdego nowego pliku. `leases.json` z pełną populacją może przekroczyć limit — jeśli tak, podziel go na `leases-core.json` i `leases-downscope-candidates.json` z osobnymi wpisami w manifeście.

- [ ] **Step 6: Commit**

```bash
git add shared backend/tests/contract
git commit -m "feat(6.1): contract-conformant API fixtures in shared/fixtures"
```

---

### Task 3: Scenariusze UC-1…UC-5 jako dane (krok 6.2, współpraca z 2.6)

**Files:**
- Create: `shared/scenarios/README.md`
- Create: `shared/scenarios/uc-01-onboarding.json`, `uc-02-downscope.json`, `uc-03-appeal-flow.json`, `uc-04-time-travel.json`, `uc-05-last-admin.json`
- Create: `backend/tests/scenarios/__init__.py`, `backend/tests/scenarios/test_scenarios.py`
- Consumes: `app/schemas/__init__.py::CONTRACT_RESPONSE_MODELS`, `app/domain/enums.py`, `shared/fixtures/*.json` (Task 2), `docs/adr/0011`
- Produces: kształt scenariusza dla generatora Osoby 2 (2.6) — czyta `given` — oraz dla runnera Task 4 — wykonuje `when`, weryfikuje `then`

**Interfejs — dokument scenariusza:**
```json
{
  "id": "uc-02-downscope",
  "use_case": "UC-2",
  "title": "Deeskalacja write → read przy braku pushów",
  "given": { "anchor": "2026-10-03T00:00:00Z", "note": "używa seeda z ADR 0008" },
  "when": [
    { "type": "reset" },
    { "type": "time_travel", "days": 15 },
    { "type": "api", "method": "GET", "path": "/api/v1/leases", "as": "leases" }
  ],
  "then": [
    { "target": "leases", "where": { "user.login": "kamil", "repository.name": "payment-service" },
      "expect": { "status": "WARNING", "recommendation": "DOWNSCOPE", "current_role": "write", "days_remaining": 5 } }
  ]
}
```

- [ ] **Step 1: Napisz testy `backend/tests/scenarios/test_scenarios.py`**

```python
def test_scenarios_cover_every_use_case_uc1_to_uc5():
    # zbiór use_case == {"UC-1","UC-2","UC-3","UC-4","UC-5"}

def test_every_scenario_starts_with_reset():
    # pierwszy krok when ma type == "reset", więc scenariusz nie zależy od stanu poprzedniego

def test_every_scenario_declares_a_fetched_target_for_each_expectation():
    # każdy then[].target występuje jako "as" w którymś kroku when

def test_scenario_expectations_reference_contract_fields():
    # każdy klucz then[].expect istnieje w polach modelu z CONTRACT_RESPONSE_MODELS

def test_activity_uses_github_event_names_and_leased_permissions():
    # action_type ∈ {PushEvent, PullRequestReviewEvent, IssueCommentEvent}
    # required_permission ∈ {write, read}; "admin" nie występuje nigdzie w scenariuszach

def test_time_travel_steps_are_within_contract_bounds():
    # każdy krok time_travel ma days w zakresie 1..365 (TimeTravelRequest)

def test_uc4_scenario_observes_active_then_warning_then_expired():
    # UC-4 ma co najmniej trzy oczekiwania dla tego samego celu,
    # w kolejności ACTIVE, WARNING, EXPIRED

def test_last_admin_scenario_starts_with_two_admins():
    # UC-5 zakłada co najmniej dwóch adminów w organizacji i co najmniej dwóch
    # w repozytorium, żeby odebranie jednego było realnym testem straży

def test_scenario_logins_belong_to_seed_population():
    # każdy login w where i w danych scenariusza należy do populacji z seed_data.py

def test_scenarios_are_utf8_without_bom():
    # brak BOM i poprawne dekodowanie UTF-8 dla wszystkich plików scenariuszy
```

- [ ] **Step 2: Uruchom testy, żeby zobaczyć porażkę**

Run z `backend/`: `.\.venv\Scripts\python.exe -m pytest tests/scenarios -q`
Expected: FAIL — `shared/scenarios/` nie istnieje, zbieranie testów nie znajduje plików.

- [ ] **Step 3: Napisz pięć scenariuszy**

Wypełnij treścią z `PRODUKT.md` §3:
- **UC-1**: `nowy-dev` bez dzierżaw → standard zespołu DEV bez `admin`, proponowane role z `BaselineEntry`.
- **UC-2**: `kamil` w `payment-service` z `write`, brak `PushEvent` w oknie, obecne `PullRequestReviewEvent` → `WARNING` + `DOWNSCOPE`.
- **UC-3**: dzierżawa `marta` w oknie ostrzegawczym, odwołanie z uzasadnieniem z polskimi znakami, decyzja `EXTEND` z `preset_days: 30` oraz odrzucenie pustego uzasadnienia.
- **UC-4**: jedna dzierżawa obserwowana po `reset`, `+15`, `+30`, `+60` → `ACTIVE`, `WARNING`, `EXPIRED`.
- **UC-5**: repozytorium i organizacja z dwoma adminami, próba odebrania jednego → `403`, a następnie udane odebranie przy dwóch adminach.

- [ ] **Step 4: Uruchom testy ponownie**

Run z `backend/`: `.\.venv\Scripts\python.exe -m pytest tests/scenarios -q`
Expected: PASS — 9 testów.

- [ ] **Step 5: Opisz interfejs dla Osoby 2 w `shared/scenarios/README.md`**

Opisz, że generator 2.6 czyta wyłącznie `given`, materializuje dzierżawy i zdarzenia względem `anchor` z ADR 0008 i nie interpretuje `when` ani `then`.

- [ ] **Step 6: Commit**

```bash
git add shared/scenarios backend/tests/scenarios
git commit -m "feat(6.2): UC-1..UC-5 scenarios as executable data"
```

---

## Faza B — weryfikacja na działającym API

> Task 4 jest **zablokowany** do czasu powstania endpointów pod widoki: `GET /api/v1/leases` (3.6), `GET /api/v1/baseline/{team_id}` i `GET /api/v1/audit` (4.x), `POST /api/v1/appeals` i `POST /api/v1/appeals/{id}/decision` (4.3–4.4). Dziś w `app/api/v1/` jest tylko `demo.py`, więc kroki RED są prawdziwe: scenariusze zwrócą `404`.

### Task 4: Testy E2E scenariuszy na poziomie API (krok 6.3)

**Files:**
- Create: `backend/tests/integration/__init__.py`
- Create: `backend/tests/integration/scenario_runner.py`
- Create: `backend/tests/integration/test_demo_scenarios.py`
- Consumes: `backend/tests/conftest.py::client` (httpx + ASGITransport), `shared/scenarios/*.json` (Task 3), `POST /api/v1/demo/reset` (istnieje), `POST /api/v1/simulation/time-travel` (2.5), endpointy 3.6 i 4.x
- Produces: `scenario_runner.load_scenarios() -> list[dict]` i `execute_scenario(client, scenario) -> dict[str, list[dict]]`

**Uwaga o kolizji:** ogólny plan implementacji tworzy ten sam plik w Zadaniu 19. Ten plan przejmuje `backend/tests/integration/test_demo_scenarios.py` na rzecz Osoby 6 — to realizacja 6.3. Plik `frontend/src/App.integration.test.tsx` z Zadania 19 pozostaje u Osoby 5.

**Interfejs harnessu:**
```python
def load_scenarios() -> list[dict]                      # czyta shared/scenarios/*.json
async def execute_scenario(client, scenario) -> dict    # wykonuje when, zwraca {target: [rekordy]}

@pytest.mark.parametrize("scenario", load_scenarios(), ids=lambda s: s["id"])
async def test_scenario_matches_expected_outcomes(client, scenario)
```

- [ ] **Step 1: Napisz testy `backend/tests/integration/test_demo_scenarios.py`**

```python
async def test_scenario_matches_expected_outcomes(client, scenario):
    # execute_scenario wykonuje when; dla każdego then wybiera rekordy po where
    # i asertuje każdy klucz z expect

async def test_scenario_results_do_not_depend_on_wall_clock(client, scenario_uc04):
    # monkeypatch datetime.now na datę odległą o rok; wynik identyczny,
    # bo obliczenia idą przez TimeProvider (ADR 0008)

async def test_uc03_empty_justification_is_rejected(client):
    # POST /api/v1/appeals z justification="" → 422 (AppealCreate minLength=1)

async def test_uc05_removing_last_admin_returns_403(client):
    # odebranie ostatniego admina organizacji i repozytorium → 403;
    # przy dwóch adminach pierwsze odebranie przechodzi
```

- [ ] **Step 2: Uruchom testy, żeby zobaczyć porażkę**

Run z `backend/`: `.\.venv\Scripts\python.exe -m pytest tests/integration -q --tb=short`
Expected: FAIL — `404` na `/api/v1/leases` (endpoint 3.6 jeszcze nie istnieje) albo `ModuleNotFoundError` dla `scenario_runner`.

- [ ] **Step 3: Zaimplementuj `scenario_runner.py`**

`load_scenarios()` czyta `shared/scenarios/*.json`, sortując po `id`. `execute_scenario()` obsługuje kroki `reset`, `time_travel`, `api`; nieznany typ kroku podnosi `ValueError` z jego nazwą. `where` rozwiązuje ścieżki kluczy z kropką (`"user.login"`). Utrzymaj plik poniżej 300 linii — przy przekroczeniu wydziel `scenario_assertions.py`.

- [ ] **Step 4: Uruchom testy ponownie**

Run z `backend/`: `.\.venv\Scripts\python.exe -m pytest tests/integration -q`
Expected: PASS — 4 funkcje testowe, 5 przypadków parametryzowanych w pierwszej.

- [ ] **Step 5: Uruchom cały zestaw backendu**

Run z `backend/`: `.\.venv\Scripts\python.exe -m pytest -q`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/integration
git commit -m "test(6.3): scenario-driven end-to-end API tests for UC-1..UC-5"
```

---

### Task 5 (mały): Podłączenie `@shared` do frontendu — po 5.1

**Files:**
- Modify: `frontend/vite.config.ts` (alias `@shared`, `server.fs.allow`)
- Create: `frontend/src/lib/fixtures.ts`
- Create: `frontend/src/lib/fixtures.test.ts`
- Consumes: `shared/fixtures/*.json` (Task 2), `frontend/src/types/api.ts` (generowany, ADR 0009)
- Produces: `loadFixture<T>(id: string): T` w `frontend/src/lib/fixtures.ts`

**Blokada:** `frontend/` zawiera dziś tylko `src/types/api.ts`. To zadanie wykonujemy dopiero po 5.1 (szkielet Vite).

- [ ] **Step 1: Napisz test `frontend/src/lib/fixtures.test.ts`**

```ts
test('alias @shared resolves and leases fixture satisfies LeaseOverview', ...)
```

- [ ] **Step 2: Uruchom test, żeby zobaczyć porażkę**

Run z `frontend/`: `npm test -- --run src/lib/fixtures.test.ts`
Expected: FAIL — brak `vite.config.ts` i `fixtures.ts`.

- [ ] **Step 3: Dodaj alias i loader**

Wstaw fragment konfiguracji z `shared/fixtures/README.md` do `frontend/vite.config.ts` i zaimplementuj `loadFixture<T>` z typem z `frontend/src/types/api.ts`.

- [ ] **Step 4: Uruchom test ponownie**

Run z `frontend/`: `npm test -- --run src/lib/fixtures.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/vite.config.ts frontend/src/lib
git commit -m "feat(6.1): wire shared fixtures into frontend via @shared alias"
```

---

## Poza zakresem tego planu (odłożone)

Kroki 6.4, 6.5 i 6.6 są świadomie pominięte — wracamy po linii cięcia (5.6) i feature freeze (5.9).

| Krok | Co wejdzie | Blokada wejścia |
| --- | --- | --- |
| 6.4 | Szablon slajdów spójny z wyglądem panelu (Design = 20% oceny) | Potrzebna paleta z `lib/statusBadges.ts` (5.2) |
| 6.5 | Opis projektu, ujawnienie AI i bibliotek, checklista zgłoszenia, HackTribe vs Challenge Rocket | Potrzebny zamknięty zakres MVP |
| 6.6 | Skrypt demo + nagranie zapasowe; rezerwa: przejęcie 5.10 (widok audytu) | Potrzebny pełny przepływ UC-1…UC-5 (5.9) |

## Kolejność i punkty synchronizacji

| Punkt z planu zespołowego | Co musi działać | Realizuje |
| --- | --- | --- |
| Po 1.2 i 6.1 | Kontrakt przyjęty, front pracuje na fixture'ach | Task 2 (walidacja modelem od pierwszego dnia, bez etapu rekoncyliacji) |
| Po 5.4 | Tabela na prawdziwych danych, przesunięcie czasu zmienia statusy | Task 3 (UC-4) + Task 4 |
| Po 5.6 | Linia cięcia: minimalne demo gotowe | Task 4 (UC-2, UC-4, UC-5 zielone) |
| Po 5.9 | Pełny przepływ UC-1 do UC-5, feature freeze | Task 4 (wszystkie pięć scenariuszy zielone) |

Faza A (Task 1–3) nie wymaga żadnego nowego endpointu i może ruszyć natychmiast. Task 5 czeka na 5.1, Task 4 na 3.6 i 4.x.
