# Mock Jiry, aktywność i dane demo

Dokumentacja modułu `backend/app/api/jira_mock` (prefiks `/rest/api/3`). Zakres: drugi dostawca obok GitHuba (ADR 0011).
Plan wykonania: `docs/superpowers/plans/2026-10-03-jira-mock-and-activity.md`. Mock GitHuba: `docs/github-mock.md`.

## 1. Po co to jest

Ten sam silnik dzierżaw ma zarządzać rolami w Jirze tak jak dostępem do GitHuba: rola w projekcie to dzierżawa, odnawiana dowodem użycia
(zmiana statusu zgłoszenia, komentarz). Mock udaje Jirę Cloud: te same ścieżki, format błędów `{"errorMessages": [], "errors": {}}` i stronicowanie `startAt/maxResults`.

```
 klient (panel / silnik)                    /api/v1/simulation/time-travel
        │  HTTP /rest/api/3/...                        │
        ▼                                              ▼
 api/jira_mock/{projects,roles,users,issues,audit}.py   TimeProvider (get_time_provider)
        │ (routery walidują i delegują)
        ▼
 services/jira_mock_service.py  jira_role_service.py  jira_issue_service.py (+ jql.py)
        │                                  │
        ▼                                  ▼
 services/access_leases.py (wspólne z GitHubem: grant, revoke, Last Admin Protection)
        │
        ▼
 Repository(provider=jira) / Lease / User / Team / ActivityEvent (SQLite)
```

Projekt Jiry to wiersz `repositories` z `provider='jira'`, `name=KEY` (np. `PAY`), `owner=longtails` (`JIRA_SITE`). Mock GitHuba ich nie widzi i odwrotnie.

## 2. Uruchomienie

Jak w `docs/github-mock.md`: `cd backend; uv sync --extra dev; uv run uvicorn app.main:app --reload`. Seed (GitHub, aktywność, Jira) ładuje się przy starcie i po `POST /api/v1/demo/reset`.
Ustawienie `JIRA_SITE` (domyślnie `longtails`) w `.env`.

## 3. Endpointy (`/rest/api/3`)

Brak uwierzytelniania (mock). Użytkownik jest identyfikowany przez `accountId` (stabilny, wyliczany z loginu, np. `712020:03cacd80-...`; `emailAddress` = `login@longtails.example`).
Role: `Viewer` (id 10200, read), `Member` (10201, write), `Administrator` (10202, admin).

| Obszar | Metoda i ścieżka | Odpowiedź |
| --- | --- | --- |
| Projekty | `GET /project/search`, `GET /project/{key\|id}` | `{startAt,maxResults,total,isLast,values}` / projekt; nieznany → `404` |
| Role | `GET /role`, `GET /project/{key}/role`, `GET /project/{key}/role/{id}` | lista ról / mapa nazwa→URL / rola z `actors` (aktywne leasy tej roli) |
| Zapis ról | `POST /project/{key}/role/{id}` body `{"user":[accountId]}` | `200` + rola; dodaje, reaktywuje albo zmienia poziom |
| | `PUT /project/{key}/role/{id}` body `{"categorisedActors":{"atlassian-user-role-actor":[...]}}` | `200`; ustawia pełny zbiór aktorów |
| | `DELETE /project/{key}/role/{id}?user={accountId}` | `204` (idempotentny; nie-aktor roli → bez zmian) |
| Użytkownicy | `GET /user?accountId=`, `GET /user/search?query=` | użytkownik / lista (po loginie lub nazwie) |
| Grupy | `GET /group/bulk`, `GET /group/member?groupname=` | grupy `DEV`, `QA` (tabela `teams`) i ich członkowie |
| Zgłoszenia | `GET /search/jql?jql=&maxResults=&nextPageToken=&fields=` | `{issues,isLast,nextPageToken?}`; bez `fields` tylko `id,key,self` |
| | `GET /issue/{key}` | zgłoszenie z polami |
| | `GET /issue/{key}/changelog`, `GET /issue/{key}/comment` | historia zmian statusu / komentarze (ADF) |
| Audyt | `GET /auditing/record?offset=&limit=&from=&to=` | zmiany administracyjne projektów (`project_updated`) |

**Błędy:** `{"errorMessages": ["..."], "errors": {"pole": "opis"}}`. Walidacja parametrów pod `/rest/api/3` daje `400`; pod `/api/v3` (GitHub) nadal `422`.
Grupy jako aktorzy ról nie są obsługiwane (`400`).

### Semantyka zapisu ról (spójna z GitHubem, ADR 0007)
Aktor roli = **aktywny `Lease`**. Nadanie ustawia `granted_at=teraz` (czas symulowany) i `expires_at=teraz+default_lease_duration_days` (30);
dla `Administrator` `expires_at=NULL`. Usunięcie ustawia `is_active=False` (wiersz zostaje), ponowne nadanie reaktywuje ten sam wiersz.
Użytkownik ma w projekcie jedną rolę: dodanie do innej roli zmienia poziom. Mock **nie zapisuje `AuditLog`**.

### Last Admin Protection (UC-5, ADR 0004)
`403` w formacie Jiry, gdy usunięcie albo zdegradowanie (też przez `PUT`/`POST` do niższej roli) zostawiłoby organizację bez właściciela
(`"Cannot remove the last administrator of the organization"`) albo projekt bez administratora (`"... of the project"`).

### JQL (podzbiór)
Obsługiwane: `project = KEY`, `updated >= "-30d"` (też `-2w`, `-5h`, `2026-09-01`), `assignee|reporter|commenter = "accountId"` (jedno z trzech), `AND`, `ORDER BY updated|created [ASC|DESC]`.
Zapytanie bez żadnego ograniczenia → `400` ("Unbounded JQL queries are not allowed here..."), każda inna konstrukcja (`OR`, `!=`, nawiasy, inne pola) → `400`.
Paginacja tokenem `nextPageToken`, `maxResults` do 100.

## 4. Zgłoszenia i aktywność

W bazie są tylko `ActivityEvent` (użytkownik, projekt, czas, typ). Zgłoszenia są wyliczane:

| Typ zdarzenia (`action_type`) | Wymaga | Odnawia dzierżawę? | W API |
| --- | --- | --- | --- |
| `jira:issue_created` | write | tak | zgłoszenie (reporter = autor najwcześniejszego zdarzenia) |
| `jira:issue_updated` | write | tak | wpis w changelogu (zmiana statusu), `assignee` = autor ostatniej zmiany |
| `comment_created` | read | tak (tylko read) | komentarz |
| `project_updated` | admin | nie | rekord audytu |

* Zgłoszenie = seria **trzech kolejnych** zdarzeń Jiry (liczonych od pierwszego zdarzenia Jiry w bazie), klucz `KEY-n`, status zależy od liczby zmian (`To Do → In Progress → In Review → Done`). Seed musi pisać zdarzenia grupami po trzy (`db/jira_seed.py` to wymusza).
* Zdarzenia z przyszłości nie są widoczne, więc time-travel w tył i w przód przesuwa okno `updated >= -Nd`. Jira nie ma limitu 90 dni jak GitHub.
* **Silnik i baseline** muszą filtrować `roles.RENEWING_ACTIONS` i `repositories.provider` (ADR 0010, 0011).

## 5. Dane demo i scenariusze

Seed `db/jira_seed.py` (po seedzie GitHuba i aktywności, w `prepare_database`) tworzy 5 projektów: `PAY`, `CORE`, `AUTH`, `QA`, `OPS`.
Użytkownicy są ci sami co w GitHubie (np. `kamil`, `marta`), `tomasz-admin` jest Administratorem wszędzie. Zdarzenia o 10:00 danego dnia (zegar "teraz" w testach 12:00, więc wiek = dni + 2 h).

| Scenariusz | Dane | t0 | +15 | +30 | +60 |
| --- | --- | --- | --- | --- | --- |
| **E** `kamil` Member w `PAY` | jedyna zmiana 24 dni temu, komentarze 6 i 3 dni temu | WARNING | DOWNSCOPE (do Viewer) | REVOKE | REVOKE |
| **F** `marta` Member w `QA` | tylko komentarze (5, 9, 13 dni temu) | DOWNSCOPE | DOWNSCOPE | REVOKE | REVOKE |
| **G** `OPS` | role `ania` (Member) i `marta` (Viewer), zero zdarzeń | REVOKE | REVOKE | – | – |
| **H** `nowy-dev` | brak ról w Jirze | onboarding | | | |
| Tło `CORE` | `ania…henryk` zmiany 1…8 dni temu; `iza`, `jan` tylko komentarze | 8× ACTIVE, 2× DOWNSCOPE | `henryk` WARNING | wszyscy REVOKE | – |
| `kamil` w `CORE` | zmiana 1 dzień temu | ACTIVE | ACTIVE | REVOKE | – |

Dodatkowo: `PAY` (7 Viewerów komentujących), `AUTH` (6 Memberów), `QA` (5 Viewerów komentujących) oraz jedno `project_updated` (`tomasz-admin`, `CORE`, 40 dni temu).
Wartości z tabeli sprawdza `tests/integration/test_jira_mock_contract.py` (oracle z reguł ADR 0002 używa tylko publicznych endpointów Jiry).

## 6. Jak to przetestować

```bash
cd backend
uv sync --extra dev
uv run pytest -q                                          # wszystko
uv run pytest tests/api/jira_mock -q                      # endpointy (odczyty, zapis ról, zgłoszenia, audyt)
uv run pytest tests/domain/test_jql.py tests/db/test_jira_seed.py -q
uv run pytest tests/integration/test_jira_mock_contract.py -q   # scenariusze E–H na skokach +15/+30/+60
```

Ręcznie (`curl`, serwer na `http://127.0.0.1:8000`):

```bash
B=http://127.0.0.1:8000
curl -s "$B/rest/api/3/project/search"                                   # 5 projektów
curl -s "$B/rest/api/3/user/search?query=kamil"                          # accountId Kamila
curl -s "$B/rest/api/3/project/PAY/role/10201"                           # aktorzy roli Member
curl -s "$B/rest/api/3/search/jql?jql=project%20%3D%20PAY%20AND%20updated%20%3E%3D%20-30d&fields=summary,status"
curl -s -i -X DELETE "$B/rest/api/3/project/PAY/role/10202?user=<accountId tomasz-admin>"   # 403 last admin
curl -s -X POST $B/api/v1/simulation/time-travel -H 'content-type: application/json' -d '{"days":15}'
```

## 7. Założenia i odchylenia od dokumentów i planu

1. **Szczegóły API Jiry nie są w pełni zweryfikowane** z oficjalną dokumentacją (nazwy pól, domyślne `fields` w `search/jql`, treść błędu dla niezawężonego JQL pochodzą z dokumentacji i pamięci). Do porównania przy podpinaniu prawdziwej Jiry.
2. **Audit records** zawierają tylko `project_updated`; zmiany ról przez mock nie są audytowane, bo mock nie zapisuje `AuditLog` (w planie było inaczej).
3. **Last Admin Protection** zwraca `403` (założenie z ADR 0004); prawdziwa Jira może zwracać `400`.
4. **Walidacja** pod `/rest/api/3` zwraca `400`, a nie `422` (format Jiry); jeden wspólny handler `RequestValidationError` deleguje po prefiksie ścieżki.
5. **Migracja `0002`** używa zwykłego `ALTER TABLE`, bo tryb batch odtwarza tabelę, do której odwołują się inne (SQLite z włączonymi kluczami obcymi).
6. **Port `AccessProvider`** (zamiast `VCSProvider`) jest tylko ustalony nazwą, kodu portu jeszcze nie ma.
7. Reguła "zgłoszenie = trzy kolejne zdarzenia" jest ograniczeniem mocka; bez schematu zdarzeń w bazie to najprostszy sposób na spójne zgłoszenia bez zmian modelu.
8. Bez uwierzytelniania, schematów uprawnień, workflowów, webhooków i tworzenia zgłoszeń przez API.
