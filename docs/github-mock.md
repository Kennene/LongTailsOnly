# Mock GitHuba, aktywność i sterowanie czasem

Dokumentacja modułu `backend/app/api/github_mock` (+ `/api/v1/simulation`, generator danych demo).
Zakres: PRODUKT.md M7 / UC-4 / UC-5, ADR 0002–0004, 0006–0010 (po scaleniu z `main`: fundament, modele i seed pochodzą od zadań 1.x). Plan wykonania: `docs/superpowers/plans/2026-10-03-github-mock-and-activity.md`.

## 1. Po co to jest

Silnik dostępów (Lease Engine) i panel admina rozmawiają z GitHubem wyłącznie przez interfejs zgodny z oficjalnym REST API v3.
Mock udaje GitHuba: te same ścieżki `/api/v3/...`, kody HTTP, formaty JSON, nagłówki i format błędów. Dzięki temu w przyszłości
adapter mockowy można podmienić na prawdziwego klienta GitHub Enterprise bez zmian w rdzeniu.

Mock jest **cienką warstwą nad bazą**: nie ma własnego stanu poza tabelami `Team`, `User`, `Repository`, `Lease`, `ActivityEvent`.

```
 klient (admin UI / Lease Engine)
        │  HTTP  /api/v3/...                 /api/v1/simulation/time-travel
        ▼
 api/github_mock/{orgs,collaborators,events}.py        api/v1/simulation.py
        │ (routery tylko walidują i delegują)                  │
        ▼                                                      ▼
 services/github_mock_service.py   github_collaborator_service.py   github_events_service.py
        │                                                      │
        ▼                                                      ▼
 Lease / User / Repository / ActivityEvent (SQLite)        TimeProvider (get_time_provider, zegar symulowany)
```

## 2. Uruchomienie

```bash
cd backend
uv sync --extra dev                       # Python 3.14
uv run uvicorn app.main:app --reload      # http://127.0.0.1:8000
```

* Swagger: `http://127.0.0.1:8000/docs` (API produktu) i osobny `http://127.0.0.1:8000/mocks/docs` (mocki GitHuba i Jiry, pogrupowane tematycznie; `app/api/mock_docs.py`).
* Przy starcie serwer wykonuje migracje, wgrywa seed demo (ADR 0008) i **dokłada aktywność mocka** (`seed_activity_extras`, sekcja 6).
* **Reset demo:** `POST /api/v1/demo/reset` (czyści bazę, zeruje zegar, ładuje seed + aktywność od nowa).
* Zegar symulacji jest w pamięci: restart serwera = powrót do czasu rzeczywistego.

## 3. Endpointy GitHuba (`/api/v3`)

Organizacja demo: `longtails`. Brak uwierzytelniania (mock). Listy są stronicowane: `?per_page=` (1–100, domyślnie 30) i `?page=`; nagłówek `Link` z `next/prev/first/last`; strona poza zakresem → `200 []`.

| Krok | Metoda i ścieżka | Odpowiedź |
| --- | --- | --- |
| 2.1 | `GET /orgs/{org}/members` | lista użytkowników (`login,id,node_id,avatar_url,url,type,site_admin`) |
| 2.1 | `GET /orgs/{org}/teams` | zespoły z tabeli `teams` (`dev`, `qa`; `id,name,slug,privacy,permission,members_url,repositories_url`) |
| 2.1 | `GET /orgs/{org}/teams/{team_slug}/members` | członkowie zespołu |
| 2.1 | `GET /orgs/{org}/repos`, `GET /repos/{owner}/{repo}` | repozytoria (`full_name,default_branch,owner{type:"Organization"}`) |
| 2.2 | `GET /repos/{owner}/{repo}/collaborators` | użytkownicy + `permissions{admin,maintain,push,triage,pull}` + `role_name` |
| 2.2 | `GET /repos/{owner}/{repo}/collaborators/{username}/permission` | `{permission, role_name, user}`; nie-collaborator → `permission:"none"`, nieznany login → `404` |
| 2.3 | `PUT /repos/{owner}/{repo}/collaborators/{username}` body `{"permission": "pull\|triage\|push\|maintain\|admin"}` (domyślnie `push`) | `201` + invitation (nowy collaborator), `204` (zmiana/ten sam poziom), `422` zły poziom, `404`, `403` last admin |
| 2.3 | `DELETE /repos/{owner}/{repo}/collaborators/{username}` | `204` (idempotentny; ustawia `is_active=False`), `404` nieznany użytkownik/repo, `403` last admin |
| 2.4 | `GET /repos/{owner}/{repo}/events` | strumień zdarzeń (sekcja 5) |

Nagłówki na każdej odpowiedzi: `X-GitHub-Media-Type: github.v3; format=json`, `X-RateLimit-Limit/Remaining/Reset/Resource` (wartości stałe, `Reset` liczony z zegara symulowanego).

**Format błędów** (jak GitHub): `{"message": "...", "documentation_url": "..."}`; dla `422` dodatkowo `"errors": [{"resource","field","code"}]`.
Błędy walidacji pod `/api/v3` też mają ten format (`"message": "Validation Failed"`); poza `/api/v3` zostaje domyślny format FastAPI.

### Wiersz `Lease` a kolaborator GitHuba

Collaborator = **aktywny** `Lease` (`is_active=True`). `PUT` ustawia `granted_at = teraz` (czas symulowany) i `expires_at = teraz + default_lease_duration_days repozytorium` (domyślnie 30).
Dla `admin` `expires_at = NULL` (stała rola break-glass). `PUT` tym samym poziomem nic nie zmienia (nie przedłuża dostępu). `DELETE` nie kasuje wiersza (ADR 0007), tylko wyłącza dostęp; kolejny `PUT` reaktywuje ten sam wiersz i zwraca `201`. Mock **nie zapisuje `AuditLog`**; audyt należy do serwisów, które go wywołują.

### Mapowanie poziomów GitHuba na model projektu (ADR 0002)

Zapisywane są tylko `Role` = `read | write | admin` (ADR 0006). `PUT` przyjmuje pełne słownictwo GitHuba (`GitHubPermission`): `pull→read`, `triage→read`, `push→write`, `maintain→write`, `admin→admin` (`roles.from_github`).
`GET` zwraca więc `pull`/`push`/`admin` (mapowanie `triage` i `maintain` jest stratne, to ścieżka post-MVP).

### Last Admin Protection (UC-5, ADR 0004)

`403 Forbidden` z komunikatem GitHubowego typu, gdy operacja (`DELETE` **albo `PUT` obniżający poziom `admin`**) usunęłaby:
* jedynego właściciela organizacji (`User.is_admin`, w demo `tomasz-admin`; liczą się aktywne leasy): `"Cannot remove the last administrator of the organization"`. Dotyczy usunięcia i degradacji w **każdym** repo.
* jedynego admina repozytorium: `"Cannot remove the last administrator of the repository"`.

## 4. Sterowanie czasem (UC-4, ADR 0003, 0008, 0010)

| Metoda | Body | Efekt |
| --- | --- | --- |
| `POST /api/v1/simulation/time-travel` | `{"days": 15}` | przesuwa zegar o 15 dni (`1 ≤ days ≤ 365`, skoki się kumulują) |
| `GET /api/v1/simulation/time-travel` | – | bieżący stan |
| `DELETE /api/v1/simulation/time-travel` | – | powrót do czasu rzeczywistego (dane bez zmian) |

Odpowiedź (`ClockRead`): `{"now": "2026-10-18T13:54:51Z", "offset_days": 15}`.
Presety UI: `+15 / +30 / +60`; pitch (`+7 / +25 / +35`) działa bez zmian (dowolna liczba dni).
Zły body (`days` ≤ 0, > 365, nie liczba, brak pola) → `422` i zegar się nie rusza. Pełny reset (dane + zegar): `POST /api/v1/demo/reset`.

Cała logika czasu idzie przez `get_time_provider()` / `ClockPort.get_current_time()`; bezpośrednie `datetime.now()` jest zabronione poza samym zegarem.

## 5. Zdarzenia aktywności

`GET /repos/{owner}/{repo}/events` zwraca zdarzenia w kształcie GitHub Events API, **najnowsze pierwsze**, z oknem **90 dni** i limitem **300** (jak GitHub), liczonymi od czasu symulowanego. Zdarzenia „z przyszłości” nie są zwracane, więc po skoku `+60` starsze wpisy znikają z feedu.

| Zdarzenie (krok 2.4) | `type` | `required_permission` | Odnawia dostęp? |
| --- | --- | --- | --- |
| push | `PushEvent` | write | **tak** (write i read) |
| review | `PullRequestReviewEvent` | read | **tak** (tylko read) |
| komentarz | `IssueCommentEvent` | read | **tak** (tylko read) |
| merge | `PullRequestEvent` (`action:"closed"`, `merged:true`) | write | nie (post-MVP) |
| label | `IssuesEvent` (`action:"labeled"`) | read | nie (post-MVP) |
| zmiana ustawień | `PublicEvent` (repo upublicznione) | admin | nie |

* GitHub Events API **nie ma** typu „zmiana ustawień repo” (`RepositoryEvent` to tylko webhook), dlatego użyto `PublicEvent`.
* Źródło prawdy o tym, co odnawia dostęp: `app/domain/roles.py` → **`RENEWING_ACTIONS`** / `is_renewing()` (3 typy z ADR 0002), poziomy w `required_permission_for` (typy merge/label/settings dodaje ADR 0010). **Silnik dostępów i baseline mają filtrować po `RENEWING_ACTIONS`**, a nie traktować każde zdarzenie o wystarczającym poziomie jako odnowienie.
* W bazie trzymane są tylko `(user, repo, timestamp, action_type, required_permission)`. Szczegóły payloadu (sha commitów, numery PR, stan review) są **wyliczane deterministycznie z `id` zdarzenia** (`build_event_payload`), więc nie wymagają zmian schematu i są stabilne między wywołaniami.
* `id` zdarzenia w JSON to string (`"10000000073"`), jak w GitHubie.

## 6. Dane demo i scenariusze

Bazowy seed (osoby, zespoły, repozytoria, leasy, scenariusze A–D, liczności baseline) należy do zadania 1.5 (`app/db/seed.py`, ADR 0008) i jest opisany w `docs/superpowers/plans/2026-10-03-p1-1.5-demo-seed.md`.
Ten moduł **tylko dokłada** aktywność mocka w `app/db/activity_extras.py::seed_activity_extras` (krok 2.6), wywoływaną z `prepare_database` po seedzie, więc `POST /api/v1/demo/reset` ją odtwarza.

Organizacja `longtails`: `tomasz-admin` (właściciel, bez zespołu, admin wszędzie), **DEV 12** (`kamil`, `ania`…`jan`, `nowy-dev`), **QA 6** (`marta`, `ola`…`tomek`), **10 repozytoriów**.

Generator (stałe ziarno `SEED`, godziny z zegara, wynik identyczny po resecie):

| Dodawane zdarzenie | Reguła | Odnawia? |
| --- | --- | --- |
| `PullRequestEvent` (merge) | ok. 60% pushy: ta sama osoba, 30–240 min później | nie |
| `IssuesEvent` (label) | ok. 50% komentarzy: ta sama osoba, 10–120 min później | nie |
| `PublicEvent` (zmiana ustawień) | `tomasz-admin` w `core-api`, 40 dni temu, 09:00 | nie |

Przy standardowym seedzie: 67 zdarzeń (24 push, 13 review, 9 komentarzy + 16 merge, 4 label, 1 zmiana ustawień). `legacy-reports` (scenariusz C) zostaje bez zdarzeń; zdarzenia z przyszłości nie powstają.
Ponieważ dokładane typy nie odnawiają dostępów, statusy i baseline z seedu się nie zmieniają (dowodzi tego `tests/integration`).

Statusy w czasie liczone z reguł ADR 0002 (zdarzenia seeda są o 10:00, „teraz” w testach 12:00, więc każdy wiek = dni + 2 h):

| Scenariusz | Dane | t0 | +15 | +30 | +60 |
| --- | --- | --- | --- | --- | --- |
| **A** `kamil` @ `payment-service` (write) | push 25 dni temu; review 2 i 5 dni temu | WARNING | DOWNSCOPE (review podtrzymuje read) | REVOKE | REVOKE |
| **B** `marta` @ `qa-automation` (read) | jeden komentarz 27 dni temu | WARNING | REVOKE | REVOKE | REVOKE |
| **C** `legacy-reports` | zero zdarzeń | – | – | – | – |
| **D** `nowy-dev` | brak dostępów (`permission: none`) | onboarding | | | |
| Tło `ania…henryk` @ `core-api` | push 1…8 dni temu | ACTIVE | ACTIVE (`henryk` WARNING) | REVOKE | – |
| `iza`, `jan` @ `core-api` | tylko review 8 i 9 dni temu | DOWNSCOPE | DOWNSCOPE | REVOKE | – |

## 7. Jak to przetestować

### Testy automatyczne (161 testów, ~9 s, razem z testami zadań 1.x)

```bash
cd backend
uv sync --extra dev
uv run pytest -q                                      # wszystko
uv run pytest tests/api/github_mock -q                # mock GitHuba (2.1–2.4) + time-travel (2.5)
uv run pytest tests/db/test_activity_extras.py -q     # generator aktywności (2.6)
uv run pytest tests/domain -q                         # mapowania, typy zdarzeń, RENEWING_ACTIONS
uv run pytest tests/integration -q                    # kontrakt end-to-end na seedzie: scenariusze A/B, skoki +15/+30/+60, last admin
```

Testy mocka budują własną mini-organizację (`tests/api/github_mock/conftest.py`) na fixture'ach `engine`/`client` z `tests/conftest.py` i podmieniają `get_time_provider` na zegar o stałym czasie (autouse tylko w tym katalogu, więc nie wpływa na inne testy).
`tests/integration` zawiera **oracle statusów** zapisany wprost z reguł ADR 0002. Gdy powstanie `lease_service`, warto podmienić oracle na wywołanie prawdziwego silnika.

### Ręcznie (`curl`)

```bash
B=http://127.0.0.1:8000
curl -s "$B/api/v3/orgs/longtails/teams/dev/members?per_page=100" | head -c 300         # 2.1
curl -s $B/api/v3/repos/longtails/payment-service/collaborators/kamil/permission           # 2.2 -> write
curl -s -X PUT $B/api/v3/repos/longtails/core-api/collaborators/nowy-dev \
     -H 'content-type: application/json' -d '{"permission":"pull"}'                      # 2.3 -> 201
curl -s -i -X DELETE $B/api/v3/repos/longtails/core-api/collaborators/tomasz-admin       # 2.3 -> 403 last admin
curl -s "$B/api/v3/repos/longtails/payment-service/events?per_page=5"                         # 2.4
curl -s -X POST $B/api/v1/simulation/time-travel -H 'content-type: application/json' -d '{"days":15}'   # 2.5
curl -s -X DELETE $B/api/v1/simulation/time-travel                                      # powrót do czasu rzeczywistego
```

Pokaz „starzenia się” danych: po `{"days": 60}` `GET .../events` w repo `payment-service` traci najstarsze wpisy (te sprzed >90 dni), a `.../collaborators/kamil/permission` nadal zwraca `write` (mock niczego nie wygasza sam; wygaszanie to zadanie silnika dostępów).

## 8. Jak z tego korzystać w pozostałych modułach

* **Lease Engine:** czas z `get_time_provider()`; typy odnawiające z `roles.RENEWING_ACTIONS`; zdarzenia z tabeli `ActivityEvent` (nie przez HTTP). Zmiany dostępu wykonuj przez `GitHubCollaboratorService.set_permission/remove` albo HTTP `PUT/DELETE`: gwarantują Last Admin Protection. Zapisując zdarzenie, ustaw `required_permission = required_permission_for(action)`.
* **Frontend:** `GET /api/v1/simulation/time-travel` przy starcie (TopBar), `POST` przy kliknięciu skoku, potem odświeżenie stanu. Typy `ClockRead`/`TimeTravelRequest` są w `src/types/api.ts`.

## 9. Założenia i odchylenia od dokumentów

1. **Model danych z `main` (ADR 0007):** `DELETE` collaboratora = `is_active=False`, nie usunięcie wiersza; ponowny `PUT` reaktywuje ten sam wiersz (`201`).
2. **Czas:** `get_current_time()` przez `ClockPort`/`get_time_provider` (ADR 0008), nie `now()` z ADR 0003.
3. **`/permission` dla istniejącego użytkownika bez dostępu** zwraca `200` z `permission:"none"` (jak GitHub), a nie `404`.
4. **Role:** `Role` = `read | write | admin` (ADR 0006); `triage`/`maintain` tylko na granicy mocka (stratne mapowanie).
5. **Typy aktywności** merge/label/settings są mock-only i nie odnawiają dostępów (ADR 0010).
6. **Time-travel:** kontrakt z `main` (`days` → `ClockRead`); dodano `GET` i `DELETE` (reset samego zegara). Wcześniejszy wariant `{"reset": true}` i `offset_seconds` został usunięty.
7. **Bez uwierzytelniania i bez prawdziwego rate-limitu** (nagłówki są stałe).
8. **Zespoły:** `/orgs/{org}/teams` zwraca tabelę `teams` (`dev`, `qa`); admin nie należy do zespołu.
9. Wcześniejszy własny seed mocka (`demo_data`, `demo_scenarios`, `activity_generator`) i własny `create_app` zostały usunięte na rzecz seeda i aplikacji z `main`.
