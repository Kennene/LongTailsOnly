# Mock GitHuba, aktywność i sterowanie czasem

Dokumentacja modułu `backend/app/api/github_mock` (+ `/api/v1/simulation`, generator danych demo).
Zakres: PRODUKT.md M7 / UC-4 / UC-5, ADR 0002–0004. Plan wykonania: `docs/superpowers/plans/2026-10-03-github-mock-and-activity.md`.

## 1. Po co to jest

Silnik dzierżaw (Lease Engine) i panel admina rozmawiają z GitHubem wyłącznie przez interfejs zgodny z oficjalnym REST API v3.
Mock udaje GitHuba: te same ścieżki `/api/v3/...`, kody HTTP, formaty JSON, nagłówki i format błędów. Dzięki temu w przyszłości
adapter mockowy można podmienić na prawdziwego klienta GitHub Enterprise bez zmian w rdzeniu.

Mock jest **cienką warstwą nad bazą**: nie ma własnego stanu poza tabelami `User`, `Repository`, `Lease`, `ActivityEvent`.

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
 Lease / User / Repository / ActivityEvent (SQLite)        TimeProvider (zegar symulowany)
```

## 2. Uruchomienie

```bash
cd backend
python3.14 -m venv .venv && source .venv/bin/activate     # wymagany Python >= 3.14
pip install -e '.[dev]'
uvicorn app.main:app --reload                              # http://127.0.0.1:8000
```

* Swagger: `http://127.0.0.1:8000/docs`.
* Przy starcie, jeśli baza jest pusta, ładuje się **organizacja demo** (sekcja 6). Baza to plik `lease_governor.db` w katalogu `backend/`.
* **Reset demo:** zatrzymaj serwer, usuń `backend/lease_governor.db`, uruchom ponownie. Historia aktywności jest zakotwiczona w chwili pierwszego startu (restart jej nie przesuwa).
* Zegar symulacji jest w pamięci: restart serwera = powrót do czasu rzeczywistego.

## 3. Endpointy GitHuba (`/api/v3`)

Organizacja demo: `longtails`. Brak uwierzytelniania (mock). Listy są stronicowane: `?per_page=` (1–100, domyślnie 30) i `?page=`; nagłówek `Link` z `next/prev/first/last`; strona poza zakresem → `200 []`.

| Krok | Metoda i ścieżka | Odpowiedź |
| --- | --- | --- |
| 2.1 | `GET /orgs/{org}/members` | lista użytkowników (`login,id,node_id,avatar_url,url,type,site_admin`) |
| 2.1 | `GET /orgs/{org}/teams` | zespoły `dev` i `qa` (`id,name,slug,privacy,permission,members_url,repositories_url`) |
| 2.1 | `GET /orgs/{org}/teams/{team_slug}/members` | członkowie zespołu |
| 2.1 | `GET /orgs/{org}/repos`, `GET /repos/{owner}/{repo}` | repozytoria (`full_name,default_branch,owner{type:"Organization"}`) |
| 2.2 | `GET /repos/{owner}/{repo}/collaborators` | użytkownicy + `permissions{admin,maintain,push,triage,pull}` + `role_name` |
| 2.2 | `GET /repos/{owner}/{repo}/collaborators/{username}/permission` | `{permission, role_name, user}`; nie-collaborator → `permission:"none"`, nieznany login → `404` |
| 2.3 | `PUT /repos/{owner}/{repo}/collaborators/{username}` body `{"permission": "pull\|triage\|push\|maintain\|admin"}` (domyślnie `push`) | `201` + invitation (nowy collaborator), `204` (zmiana/ten sam poziom), `422` zły poziom, `404`, `403` last admin |
| 2.3 | `DELETE /repos/{owner}/{repo}/collaborators/{username}` | `204` (idempotentny), `404` nieznany użytkownik/repo, `403` last admin |
| 2.4 | `GET /repos/{owner}/{repo}/events` | strumień zdarzeń (sekcja 5) |

Nagłówki na każdej odpowiedzi: `X-GitHub-Media-Type: github.v3; format=json`, `X-RateLimit-Limit/Remaining/Reset/Resource` (wartości stałe, `Reset` liczony z zegara symulowanego).

**Format błędów** (jak GitHub): `{"message": "...", "documentation_url": "..."}`; dla `422` dodatkowo `"errors": [{"resource","field","code"}]`.
Błędy walidacji pod `/api/v3` też mają ten format (`"message": "Validation Failed"`); poza `/api/v3` zostaje domyślny format FastAPI.

### Zapis dostępu a dzierżawa

Collaborator = wiersz `Lease`. `PUT` ustawia `granted_at = teraz` (czas symulowany) i `expires_at = teraz + default_lease_duration_days repozytorium` (domyślnie 30).
Dla `admin` `expires_at = NULL` (stała rola break-glass). `PUT` tym samym poziomem nic nie zmienia (nie przedłuża dzierżawy). Mock **nie zapisuje `AuditLog`**; audyt należy do serwisów, które go wywołują.

### Mapowanie poziomów GitHuba na model projektu (ADR 0002)

Zapisywane są tylko `read | write | admin`. `PUT` przyjmuje pełne słownictwo GitHuba: `pull→read`, `triage→read`, `push→write`, `maintain→write`, `admin→admin`.
`GET` zwraca więc `pull`/`push`/`admin` (mapowanie `triage` i `maintain` jest stratne, to ścieżka post-MVP).

### Last Admin Protection (UC-5, ADR 0004)

`403 Forbidden` z komunikatem GitHubowego typu, gdy operacja (`DELETE` **albo `PUT` obniżający poziom `admin`**) usunęłaby:
* jedynego właściciela organizacji (`User.is_admin`, w demo `tomasz-admin`): `"Cannot remove the last administrator of the organization"`. Dotyczy usunięcia i degradacji w **każdym** repo.
* jedynego admina repozytorium: `"Cannot remove the last administrator of the repository"`.

## 4. Sterowanie czasem (UC-4, ADR 0003)

`POST /api/v1/simulation/time-travel`

| Body | Efekt |
| --- | --- |
| `{"days": 15}` | przesuwa zegar o 15 dni (`1 ≤ days ≤ 365`, skoki się kumulują) |
| `{"reset": true}` | powrót do czasu rzeczywistego |

`GET /api/v1/simulation/time-travel` zwraca bieżący stan. Odpowiedź: `{"simulated_now": "2026-10-18T13:54:51Z", "offset_seconds": 1296000}`.
Presety UI: `+15 / +30 / +60`; pitch z dokumentów (`+7 / +25 / +35`) działa bez zmian (dowolna liczba dni).
Zły body (`days` ≤ 0, > 365, nie liczba, brak/oba pola) → `422` i zegar się nie rusza.

Cała logika czasu idzie przez `TimeProvider.get_current_time()`; bezpośrednie `datetime.now()` jest zabronione poza samym zegarem.

## 5. Zdarzenia aktywności

`GET /repos/{owner}/{repo}/events` zwraca zdarzenia w kształcie GitHub Events API, **najnowsze pierwsze**, z oknem **90 dni** i limitem **300** (jak GitHub), liczonymi od czasu symulowanego. Zdarzenia „z przyszłości” nie są zwracane, więc po skoku `+60` starsze wpisy znikają z feedu.

| Zdarzenie (krok 2.4) | `type` | `required_permission` | Odnawia dzierżawę? |
| --- | --- | --- | --- |
| push | `PushEvent` | write | **tak** (write i read) |
| review | `PullRequestReviewEvent` | read | **tak** (tylko read) |
| komentarz | `IssueCommentEvent` | read | **tak** (tylko read) |
| merge | `PullRequestEvent` (`action:"closed"`, `merged:true`) | write | nie (post-MVP) |
| label | `IssuesEvent` (`action:"labeled"`) | read | nie (post-MVP) |
| zmiana ustawień | `PublicEvent` (repo upublicznione) | admin | nie |

* GitHub Events API **nie ma** typu „zmiana ustawień repo” (`RepositoryEvent` to tylko webhook), dlatego użyto `PublicEvent`.
* Źródło prawdy o tym, co odnawia dzierżawę: `app/domain/github_events.py` → **`LEASE_RENEWING_EVENT_TYPES`** (3 typy z ADR 0002) oraz `EVENT_REQUIRED_PERMISSION`. **Silnik dzierżaw ma importować tę stałą**, a nie traktować każde zdarzenie o wystarczającym poziomie jako odnowienie.
* W bazie trzymane są tylko `(user, repo, timestamp, action_type, required_permission)`. Szczegóły payloadu (sha commitów, numery PR, stan review) są **wyliczane deterministycznie z `id` zdarzenia** (`build_event_payload`), więc nie wymagają zmian schematu i są stabilne między wywołaniami.
* `id` zdarzenia w JSON to string (`"10000000073"`), jak w GitHubie.

## 6. Dane demo i scenariusze

Ładowane przez `app/db/demo_data.py::load_demo_data` (ten sam kod wywołuje start aplikacji, gdy `Settings.seed_demo=True`). Dane opisuje `app/db/demo_scenarios.py`; generator historii to `app/db/activity_generator.py` (funkcja czysta + osobny persister, deterministyczny, `seed=2026` zmienia tylko godziny w obrębie dnia).

Organizacja `longtails`: `tomasz-admin` (zespół `IT`, właściciel, admin wszędzie, bez wygasania), **DEV 12** (`dev-kamil`, `dev-01..10`, `dev-new`), **QA 6** (`qa-marta`, `qa-01..05`), **10 repozytoriów**.
Leasy są wyprowadzane z historii: `write`, jeśli użytkownik pushował w repo (wygasa 30 dni po ostatnim pushu), inaczej `read` (30 dni po ostatnim review/komentarzu).

| Scenariusz | Dane | t0 | +15 | +30 | +60 |
| --- | --- | --- | --- | --- | --- |
| **A** `dev-kamil` @ `payment-gw` (write) | ostatni push 18 dni temu; review 2/6/11 dni, komentarz 4 | ACTIVE | write wygasa → propozycja `read` | revoke | revoke |
| **B** `qa-marta` @ `core-api` (read) | jeden komentarz 27 dni temu | WARNING (≈3 dni) | revoke | revoke | revoke |
| **C** `legacy-reports` | zero zdarzeń; leasy `dev-01`, `qa-01` już wygasłe | EXPIRED | – | – | – |
| **D** `dev-new` | brak zdarzeń i dostępów | onboarding ze standardem zespołu | | | |
| Tło `dev-01..10` | ostatni push 1,3,5,…,19 dni temu | wszyscy ACTIVE | 4 ACTIVE, 3 WARNING, 2+ do revoke | wszyscy do revoke | – |

Pitch (+25 / +35) również zgadza się z tabelą: na +25 Kamil ma propozycję down-scope, `dev-01` jest w WARNING; na +35 Kamil trafia do revoke.

**Baseline zespołu** (próg 50%, okno 30 dni). Liczby są dobrane tak, by wynik nie zależał od tego, czy `dev-new` wlicza się do mianownika:

| Repo | DEV aktywnych | Wynik |
| --- | --- | --- |
| `core-api` 9/12, `auth-service` 8/12, `frontend-app` 8/12 | push | write |
| `notifications` 6/12 (dokładnie 50%) | push | write |
| `mobile-app` 7/12 | tylko review/komentarze | read |
| `data-pipeline` 5/12 (41,7%), `payment-gw` 3/12 | | poniżej progu |

QA: `frontend-app` 4/6 → read, `core-api` 3/6 (dokładnie 50%) → read, `auth-service` 2/6 → poniżej progu. Admin nigdy nie trafia do standardu.
Zdarzenia „szumu” (merge, label, public) są generowane tylko dla użytkowników już aktywnych w danym repo przez typy odnawiające, więc nie zmieniają liczności aktywnych niezależnie od tego, które typy baseline liczy.

## 7. Jak to przetestować

### Testy automatyczne (112 testów, ~5 s)

```bash
cd backend
pip install -e '.[dev]'
pytest -q                                   # wszystko
pytest tests/api/github_mock -q             # tylko mock GitHuba (kroki 2.1–2.4)
pytest tests/api/test_simulation.py -q      # time-travel (2.5)
pytest tests/db tests/domain -q             # generator, dane demo, mapowania (2.6)
pytest tests/integration -q                 # kontrakt end-to-end: scenariusze A/B, skoki +15/+30/+60 i +25/+35, last admin
```

Testy używają własnej mini-organizacji (`tests/api/conftest.py`) i zegara z ustalonym czasem bazowym, więc są deterministyczne i niezależne od seeda zespołu.
`tests/integration` zawiera **oracle statusów** zapisany wprost z reguł ADR 0002. Gdy powstanie `lease_service`, warto podmienić oracle na wywołanie prawdziwego silnika.

### Ręcznie (`curl`)

```bash
B=http://127.0.0.1:8000
curl -s "$B/api/v3/orgs/longtails/teams/dev/members?per_page=100" | head -c 300         # 2.1
curl -s $B/api/v3/repos/longtails/payment-gw/collaborators/dev-kamil/permission          # 2.2 -> write
curl -s -X PUT $B/api/v3/repos/longtails/docs-site/collaborators/dev-new \
     -H 'content-type: application/json' -d '{"permission":"pull"}'                      # 2.3 -> 201
curl -s -i -X DELETE $B/api/v3/repos/longtails/core-api/collaborators/tomasz-admin       # 2.3 -> 403 last admin
curl -s "$B/api/v3/repos/longtails/payment-gw/events?per_page=5"                         # 2.4
curl -s -X POST $B/api/v1/simulation/time-travel -H 'content-type: application/json' -d '{"days":15}'   # 2.5
curl -s -X POST $B/api/v1/simulation/time-travel -H 'content-type: application/json' -d '{"reset":true}'
```

Pokaz „starzenia się” danych: po `{"days": 60}` `GET .../events` w repo `payment-gw` traci najstarsze wpisy (te sprzed >90 dni), a `.../collaborators/dev-kamil/permission` nadal zwraca `write` (mock niczego nie wygasza sam; wygaszanie to zadanie silnika dzierżaw).

## 8. Jak z tego korzystać w pozostałych modułach

* **Lease Engine:** czas z `TimeProvider`; typy odnawiające z `LEASE_RENEWING_EVENT_TYPES`; zdarzenia z tabeli `ActivityEvent` (nie przez HTTP). Zmiany dostępu wykonuj przez `GitHubCollaboratorService.set_permission/remove` albo HTTP `PUT/DELETE`: gwarantują Last Admin Protection. Samo `record_activity` powinno zapisywać `required_permission` z `EVENT_REQUIRED_PERMISSION`.
* **Frontend:** `GET /api/v1/simulation/time-travel` przy starcie (TopBar), `POST` przy kliknięciu skoku, potem odświeżenie stanu.
* **Seed zespołu (Zadanie 4 planu głównego):** można wywołać `load_demo_data` zamiast pisać własny seed albo uzgodnić loginy/repozytoria z `demo_scenarios.py`.

## 9. Założenia i odchylenia od dokumentów

1. **`Lease.expires_at` jest nullable** (admin = `NULL`), brak kolumny `is_active`, `DELETE` usuwa wiersz. Do potwierdzenia z autorem Zadania 3 planu głównego.
2. **Czas:** używamy `get_current_time()` (CODING_STANDARDS, Zadanie 2), nie `now()` z ADR 0003.
3. **`/permission` dla istniejącego użytkownika bez dostępu** zwraca `200` z `permission:"none"` (jak GitHub), a nie `404`.
4. **Role:** model dzierżaw to `write > read` + stały `admin` (ADR 0002). Plan szczegółowy z pełną hierarchią 5 poziomów i dzierżawionym adminem został pominięty.
5. **`api/v1/simulation.py`** należy do tego modułu (Zadanie 11 planu głównego nie powinno go tworzyć ponownie).
6. **Bez uwierzytelniania i bez prawdziwego rate-limitu** (nagłówki są stałe).
7. **Team `IT`** (`tomasz-admin`) nie jest zespołem GitHuba; `/orgs/{org}/teams` zwraca tylko `dev` i `qa`.
8. Modele `Appeal` i `AuditLog` nie są częścią tego modułu (nie powstały).
