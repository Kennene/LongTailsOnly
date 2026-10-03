# Plan: Mock Jiry i aktywność (`api/jira_mock`)

> Status: **wdrożony** (decyzje D1–D6 wg rekomendacji). Odchylenia: sekcja na końcu.
> Dotyczy: drugiego dostawcy obok GitHuba. Cel strategiczny: dowieść, że rdzeń (dzierżawy, silnik, panel) jest niezależny od dostawcy (ADR 0001, PLAN.md "Porty i Adaptery").
> Wzorzec: `docs/github-mock.md` i `docs/superpowers/plans/2026-10-03-github-mock-and-activity.md`.

## 1. Po co Jira

Jira to nośnik realnego ryzyka (dostęp do backlogu, specyfikacji, zgłoszeń o podatnościach) i ma te same problemy co GitHub: role w projektach nadawane "na zapas" i nigdy nie odbierane.
Drugi mock daje trzy rzeczy:
1. Argument dla jury: "ten sam silnik zarządza GitHubem i Jirą".
2. Test architektury: jeśli dodanie Jiry wymusza zmiany w silniku, abstrakcja jest zła i lepiej to wiedzieć teraz.
3. Nowe scenariusze demo (np. QA z rolą Member w projekcie, które tylko komentuje, więc propozycja obniżenia do Viewer).

## 2. Decyzje do podjęcia (rekomendacja w pierwszej kolejności)

| # | Decyzja | Rekomendacja | Alternatywa | Koszt błędu |
| --- | --- | --- | --- | --- |
| D1 | Jak reprezentować projekt Jiry w bazie | **Dodać kolumnę `provider` do `repositories`** (`github` domyślnie, `jira`), projekt Jiry to wiersz z `name=KEY`, `owner=<site>`. Zmiana addytywna, jedna migracja | Osobna tabela `jira_projects` + polimorficzne `Lease` (czysto, ale rusza leasy, silnik i kontrakt) albo pełny rename `Repository→Resource` (inwazyjne dla zadań 1.x) | Wysoki: modele należą do ADR 0007 (kocik), potrzebna zgoda przed migracją |
| D2 | Mapowanie ról | Viewer=`read`, Member (Developer)=`write`, Administrator=`admin` (ADR 0006 bez zmian) | Pełne schematy uprawnień Jiry | Niski |
| D3 | Źródło "dowodu użycia" | Zdarzenia pochodne z `ActivityEvent` (jak w GitHubie), wystawione przez **prawdziwe endpointy Jiry**: wyszukiwanie JQL, changelog, komentarze, audit records | Własny endpoint `/events` (nierealistyczny, Jira go nie ma) | Średni: adapter prawdziwej Jiry musiałby być inny niż mock |
| D4 | Które akcje odnawiają dzierżawę | Utworzenie zgłoszenia i zmiana statusu/pól = poziom `write`; komentarz = poziom `read`; zmiany administracyjne nie odnawiają (ADR 0010) | Każda aktywność odnawia | Niski, ale wpływa na scenariusze |
| D5 | Nazwa portu | `AccessProvider` (zamiast `VCSProvider` z PLAN.md), bo Jira nie jest systemem kontroli wersji | Zostawić `VCSProvider` | Niski, ale mylące w kodzie i dokumentach |
| D6 | JQL | Wąski podzbiór (sekcja 5.4), reszta → `400` w formacie Jiry | Pełny parser JQL | Wysoki koszt czasu, zero wartości dla demo |

**Do potwierdzenia przez Ciebie przed startem:** D1 (zgoda autora zadań 1.x na kolumnę `provider`) i D4. Reszta ma bezpieczną wartość domyślną.

## 3. Zakres i poza zakresem

W zakresie: projekty, role projektowe i ich aktorzy, użytkownicy i grupy, zgłoszenia (odczyt), changelog, komentarze, audit records, generator historii pod scenariusze, testy, dokumentacja.
Poza zakresem: tworzenie zgłoszeń przez API (dane pochodzą z generatora), schematy uprawnień i workflowy, uwierzytelnianie (Basic/OAuth), webhooki, Jira Data Center (tylko Cloud), prawdziwy rate-limit.

## 4. Zgodność z prawdziwym API (do zweryfikowania na początku zadania 2)

Prefiks `/rest/api/3` (Jira Cloud). Przed implementacją każdego endpointu porównać schemat z dokumentacją Atlassiana (WebFetch na `developer.atlassian.com`), tak jak przy GitHubie. Wstępnie (z dokumentacji i wyszukiwania; szczegóły pól do potwierdzenia):

| Cel | Endpoint | Uwagi |
| --- | --- | --- |
| Projekty | `GET /project/search`, `GET /project/{keyOrId}` | stronicowanie `startAt/maxResults/total/isLast`, obiekt `values` |
| Role | `GET /project/{key}/role`, `GET /project/{key}/role/{id}`, `GET /role` | `/role` zwraca mapę nazwa→URL, szczegóły roli mają `actors` |
| Zapis ról | `POST /project/{key}/role/{id}` (dodaj aktorów), `PUT` (ustaw), `DELETE /project/{key}/role/{id}?user={accountId}` | grupa "Project role actors" w dokumentacji Atlassiana |
| Użytkownicy | `GET /user?accountId=`, `GET /user/search?query=` | tożsamość to `accountId`, nie `login` |
| Grupy (odpowiednik zespołów) | `GET /group/bulk`, `GET /group/member?groupname=` | `DEV`, `QA` |
| Zgłoszenia | `GET /search/jql?jql=...`, `GET /issue/{key}`, `GET /issue/{key}/changelog`, `GET /issue/{key}/comment` | stary `/search` został wyłączony na rzecz `/search/jql`; paginacja tokenem `nextPageToken` (nie `startAt`), do sprawdzenia w dokumentacji |
| Audyt | `GET /auditing/record` | tylko zmiany administracyjne (np. zmiana roli), nie aktywność w zgłoszeniach |

Format błędów Jiry: `{"errorMessages": ["..."], "errors": {"pole": "opis"}}` (inny niż GitHuba). Nagłówki: bez rate-limitu, `X-AREQUESTID` stały lub z licznika.

## 5. Projekt

### 5.1 Model i zmiany w bazie (D1)
- Migracja `0002_resource_provider`: `repositories.provider` (`VARCHAR(16)`, domyślnie `github`, `NOT NULL`). `test_migrations_match_models` zielony.
- Mock GitHuba filtruje po `provider='github'` (`list_repos`, `get_repo`); mock Jiry po `provider='jira'`. Test regresji: Jira nie wycieka do `/api/v3/orgs/.../repos` i odwrotnie.
- `ActionType` dostaje typy Jiry (nazwy w stylu webhooków Jiry, ≤ 32 znaki): `JIRA_ISSUE_CREATED="jira:issue_created"`, `JIRA_ISSUE_UPDATED="jira:issue_updated"`, `JIRA_COMMENT_CREATED="comment_created"`, `JIRA_PROJECT_UPDATED="project_updated"` (administracyjne). Wymagane poziomy: write, write, read, admin. `RENEWING_ACTIONS` dostaje trzy pierwsze. Zmiana enumu → regeneracja `contract/schema.json` i `frontend/src/types/api.ts` (ADR 0009).
- `accountId` Jiry wyliczany deterministycznie z `User.login` (np. `uuid5`), bez nowej kolumny. E-mail `login@longtails.example`.
- Dziennik i identyfikatory zgłoszeń (`PAY-123`) wyliczane z `id` zdarzenia i klucza projektu, jak payloady GitHuba (nic nie jest zapisywane poza `ActivityEvent`).

### 5.2 Warstwy (jak w mocku GitHuba)
`api/jira_mock/{router,projects,roles,users,issues,audit,http,deps}.py` (każdy < 300 linii) → `services/jira_*_service.py` → `Lease/User/Repository/ActivityEvent`. Router tylko waliduje i deleguje. Czas z `get_time_provider`, sesja z `get_session`, ustawienia z `get_settings` (nowe pole `jira_site`, domyślnie `longtails`). Handlery błędów Jiry rejestrowane obok handlerów GitHuba, rozróżnianie po prefiksie ścieżki (`/rest/api/3` vs `/api/v3`).

### 5.3 Semantyka zapisu ról (spójna z GitHubem i ADR 0007)
- `POST .../role/{id}` z `{"user":[accountId]}` tworzy aktywny `Lease` (`granted_at=teraz`, `expires_at=teraz+TTL`; dla roli Administrator `expires_at=NULL`) albo reaktywuje nieaktywny wiersz. Odpowiedź: rola z aktorami.
- `PUT` ustawia pełny zbiór aktorów roli (aktorzy nieobecni → `is_active=False`, z Last Admin Protection).
- `DELETE ...?user=` ustawia `is_active=False` (idempotentne, `204`).
- Jeden użytkownik ma w projekcie jedną rolę (unikalność `user+repo`, ADR 0007): dodanie do innej roli zmienia poziom.
- **Last Admin Protection (UC-5, ADR 0004):** usunięcie lub zdegradowanie ostatniego administratora projektu albo jedynego właściciela organizacji → `403` w formacie Jiry. Kod `403` to założenie z ADR 0004 (prawdziwa Jira może zwracać `400`); zapisać w odchyleniach.

### 5.4 Zgłoszenia i aktywność (D3, D6)
Endpointy tylko do odczytu, dane pochodne z `ActivityEvent`:
- `GET /search/jql` obsługuje podzbiór: `project = KEY`, `updated >= "-Nd"` / `"YYYY-MM-DD"`, `assignee`/`reporter`/`commenter = "accountId"` (dopasowanie po aktorach zdarzeń), `ORDER BY updated DESC`, `maxResults ≤ 100`. Inne konstrukcje → `400` z `errorMessages`.
- `GET /issue/{key}/changelog`: historie z autorem (`author.accountId`) i `created`; `GET /issue/{key}/comment`: komentarze.
- `GET /auditing/record`: zmiany ról (z nowych `PUT/POST/DELETE`) i `project_updated`. Zapis rekordu audytu mocka jest w pamięci wyliczany z `ActivityEvent`; mock **nie zapisuje `AuditLog`** (jak GitHub, audyt należy do serwisów wywołujących).
- Brak limitu 90 dni (Jira go nie ma); zdarzenia z przyszłości nie są zwracane (time-travel działa jak przy GitHubie).

### 5.5 Dane demo i scenariusze (generator `db/jira_seed.py`)
Addytywny, deterministyczny i idempotentny seed po `seed_demo_data` i `seed_activity_extras`, wywoływany z `prepare_database` (więc `POST /api/v1/demo/reset` go odtwarza). Nie zmienia danych GitHuba ani liczności baseline.

Pięć projektów: `PAY`, `CORE`, `AUTH`, `QA`, `OPS`. Użytkownicy ci sami co w GitHubie (`kamil`, `marta`, ...), żeby graf uprawnień pokazywał jedną osobę w dwóch systemach.

| Scenariusz | Dane | t0 | +15 | +30 |
| --- | --- | --- | --- | --- |
| **E** `kamil` w `PAY` (Member=write) | ostatnia zmiana zgłoszenia 24 dni temu, komentarze 3 i 6 dni temu | WARNING | DOWNSCOPE do Viewer | REVOKE |
| **F** `marta` w `QA` (Member=write) | tylko komentarze (od 5 dni), nigdy nie tworzy zgłoszeń | DOWNSCOPE (write bez dowodu) | DOWNSCOPE | REVOKE |
| **G** `OPS` | zero zdarzeń | wygasły | – | – |
| **H** `nowy-dev` | brak ról | onboarding standardem zespołu z Jiry | | |
| Tło | pozostali z regularną aktywnością | ACTIVE | część WARNING | część REVOKE |

(Dokładne liczby w teście integracyjnym liczone z reguł ADR 0002 jak w mocku GitHuba; powyższe są hipotezą do zweryfikowania w kroku Task 6.)

## 6. Zadania (TDD: test czerwony → kod → zielony → refaktor; małe commity)

Kolejność Task 0 → 8; Task 0 blokuje resztę (potrzebuje decyzji D1).

### Task 0: ADR 0011 i uzgodnienie z autorem zadań 1.x
- Create: `docs/adr/0011-multi-provider-resources-and-jira-mock.md` (D1–D6, odpowiedź na "dlaczego `provider` zamiast osobnej tabeli", pytanie o `AccessProvider`).
- Rezultat: zgoda na migrację i listę zmian w enumach. Bez tego dalej nie idziemy.

### Task 1: Migracja `provider` i filtrowanie GitHuba
- Test najpierw: `test_migrations_match_models`, test że `/api/v3/orgs/longtails/repos` nie zwraca wiersza `provider='jira'`.
- Modify: `models/repository.py`, `alembic/versions/0002_*`, `services/github_mock_service.py` (filtr), konwencje seeda (provider jawnie `github`).
- Weryfikacja: wszystkie 161 istniejących testów zielone.

### Task 2: Domena Jiry: enumy, role, odnawianie
- Modify: `domain/enums.py` (4 typy), `domain/roles.py` (`_REQUIRED_PERMISSION`, `RENEWING_ACTIONS`), `domain/jira_roles.py` (nowy: nazwy ról Jiry ↔ `Role`, `accountId` z loginu).
- Tests: tabela poziomów i `is_renewing`; mapowanie ról i deterministyczny `accountId`.
- Regeneracja kontraktu (`scripts/export_contract.py` + `npx json-schema-to-typescript`, README backendu), `test_contract_is_fresh` zielony.
- **Krok 0 zadania:** WebFetch dokumentacji Atlassiana i korekta tabeli z sekcji 4 (nazwy pól, paginacja `search/jql`).

### Task 3: Plumbing HTTP Jiry
- Create: `api/jira_mock/http.py` (`JiraError`, format `errorMessages/errors`, paginacja `startAt/maxResults/total/isLast`, walidacja → `400`), `router.py` (prefiks `/rest/api/3`), podpięcie w `main.py` obok GitHuba.
- Tests: format błędu, paginacja (granice, strona poza zakresem), brak interferencji z handlerami GitHuba pod `/api/v3`.

### Task 4: Odczyty (projekty, role, użytkownicy, grupy)
- Create: `projects.py`, `roles.py`, `users.py`, serwisy odczytu, payloady `schemas/jira_payloads.py` (kształt Jiry: `self`, `id`, `key`, `projectTypeKey`, `accountId`, `displayName`, `emailAddress`, `active`, `avatarUrls`).
- Tests: projekt po kluczu i po `id`, `404` dla nieznanego, aktorzy roli to tylko aktywne leasy, grupy `DEV`/`QA` z tabeli `teams`.

### Task 5: Zapis ról + Last Admin Protection
- Create: `services/jira_role_service.py` (reużyć logikę `github_collaborator_service` przez wspólną funkcję domenową, żeby nie duplikować reguł; decyzja w refaktorze).
- Tests: POST tworzy lease z TTL, ponowny POST reaktywuje, PUT ustawia zbiór, DELETE wyłącza i jest idempotentny, zmiana roli = zmiana poziomu, admin bez wygasania, nieznany użytkownik/rola/projekt, Last Admin (usunięcie i degradacja, w projekcie i w organizacji).

### Task 6: Zgłoszenia, changelog, komentarze, audit
- Create: `issues.py`, `audit.py`, `domain/jira_events.py` (deterministyczny payload i klucze `KEY-n` z `id` zdarzenia), parser JQL (`services/jql.py`, wąski podzbiór, `400` dla reszty).
- Tests: filtrowanie po projekcie i dacie względem zegara, `ORDER BY`, `commenter`, paginacja tokenem, determinizm, zdarzenia z przyszłości niewidoczne po time-travel wstecz/naprzód.

### Task 7: Generator i scenariusze E–H
- Create: `db/jira_seed.py`, hook w `db/bootstrap.py` po `seed_activity_extras`.
- Tests: idempotencja, determinizm po resecie, brak wpływu na dane GitHuba i baseline, scenariusze E–H z oracle'm z reguł ADR 0002 (jak w `tests/integration`) na skokach +15/+30/+60.

### Task 8: Dokumentacja i weryfikacja
- Create: `docs/jira-mock.md` (jak `github-mock.md`: cel, uruchomienie, endpointy, semantyka, scenariusze, testowanie, odchylenia), wpis w `AGENTS.md`, `backend/README.md`, uzupełnienie planu o odchylenia po implementacji.
- Weryfikacja przed zakończeniem: pełny `pytest`, `test_migrations_match_models`, `test_contract_is_fresh`, ręczny przebieg `curl` z dokumentu.

## 7. Ryzyka

1. **Kolizja z zadaniami 1.x** (modele, kontrakt): migracja i enumy dotykają cudzego kodu. Mitygacja: Task 0 i krótki, osobny PR z samą migracją.
2. **Zgodność z prawdziwą Jirą:** API ewoluuje (np. wyłączenie `/search`). Mitygacja: weryfikacja dokumentacji na początku Tasku 2 i 6, a rozbieżności zapisane w odchyleniach.
3. **JQL rośnie niekontrolowanie:** sztywny podzbiór z `400` dla reszty.
4. **Powielanie reguł z GitHuba:** wspólna logika leasów w warstwie domenowej, nie kopiowanie serwisów.
5. **Czas:** to ok. 50–70% pracy mocka GitHuba (mniej endpointów, ale dochodzi migracja, JQL i nowy generator). Jeśli czas jest krytyczny, wycinamy w tej kolejności: audit records, grupy, JQL `commenter`.

## 8. Definicja ukończenia
- Wszystkie testy (istniejące + nowe) zielone, wynik pokazany w komunikacie końcowym.
- Mock GitHuba zachowuje się bez zmian (regresja).
- Dokumentacja zgodna z kodem (`docs/jira-mock.md`, ADR 0011, AGENTS.md).
- Scenariusze E–H widoczne w `POST /api/v1/demo/reset` + time-travel.

## Odchylenia wprowadzone podczas implementacji

Wykonano zadania 0–8 (z testami; wynik w komunikacie końcowym). Zmiany względem planu:

1. **ADR 0011** zapisano razem z kodem (Task 0 bez osobnej akceptacji autora zadań 1.x; zmiana jest addytywna, ale **warto ją potwierdzić przy review**).
2. **Audit records** zawierają wyłącznie `project_updated` (mock nie zapisuje `AuditLog`, więc zmiany ról nie są listowane).
3. **Grupowanie zgłoszeń:** zamiast stałego `id // 3` użyto serii trzech kolejnych zdarzeń liczonych od pierwszego zdarzenia Jiry (`origin`), żeby nie zależało od liczby wcześniejszych zdarzeń GitHuba. Seed pisze zdarzenia grupami po trzy.
4. **Scenariusze** E–H policzono ręcznie przed kodem i potwierdzono testem integracyjnym; scenariusz F to DOWNSCOPE na t0 i +15, a G (OPS) to nieużywany dostęp.
5. **Migracja 0002** to zwykły `ALTER TABLE` (tryb batch psuje tabelę z kluczami obcymi w SQLite).
6. **Wspólny serwis leasów** (`access_leases.py`) powstał od razu, a mock GitHuba przepisano na niego (regresja zielona).
7. **Port `AccessProvider`** nie został zaimplementowany (brak kodu portów w repo); nazwa ustalona w ADR 0011.
8. Walidacja pod `/rest/api/3` zwraca `400` (format Jiry); jeden wspólny handler deleguje po prefiksie.
