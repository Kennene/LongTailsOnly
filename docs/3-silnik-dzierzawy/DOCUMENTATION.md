# Silnik dzierżawy — Osoba 3 (Guziol)

> **Stan na: 2026-10-03.** Kroki 3.1–3.6. Gałęzie: `guziol/silnik-dzierzawy` (3.1–3.3, 3.5, 3.6) i `guziol/ochrona-ostatniego-admina`
> (3.4, wycięta z `main`, zmergowana lokalnie przed 3.5). Plan: [`2026-10-03-p3-silnik-dzierzawy.md`](../superpowers/plans/2026-10-03-p3-silnik-dzierzawy.md).
> Dokument zastępuje szkic [`archive/2026-10-03-draft-lease-rules-for-person-3.md`](../superpowers/specs/archive/2026-10-03-draft-lease-rules-for-person-3.md)
> i zamyka otwarte kwestie O1 i O2 z [ADR 0011](../adr/0011-person-4-baseline-appeals-audit-insights.md).

## 1. Zakres i odbiorcy

Silnik liczy dla każdej dzierżawy status, liczbę dni i rekomendację, odnawia dzierżawy aktywnością, wykonuje decyzje
administratora (przedłuż / zdeeskaluj / odbierz), pilnuje ostatniego admina i działa w trzech trybach egzekwowania.

| Kto | Czego potrzebuje |
| --- | --- |
| Osoba 4 (4.6B dashboard i graf) | `list_lease_overviews(session, now) -> list[LeaseOverview]` w `app/services/lease_service.py` |
| Osoba 4 (4.3C decyzja w odwołaniu) | `apply_lease_decision(session, vcs, *, lease, decision, now, actor_id) -> Lease` w `app/services/decision_service.py` |
| Osoba 5 (tabela, modal decyzji) | `GET /api/v1/leases`, `POST /api/v1/leases/{id}/decision`, `GET /api/v1/leases/{id}/activity-stats` |
| Osoba 6 (scenariusze UC-2…UC-5) | `GET /api/v1/leases` z wartościami zgodnymi ze scenariuszami |

## 2. Decyzje (rozstrzygnięte 2026-10-03)

| # | Rozbieżność | Decyzja | Dlaczego |
| --- | --- | --- | --- |
| D1 | Lista: 3.3 „ma admin, używa tylko push”; ADR 0002/0006/0008: admin jest stały | 3.3 wykrywa **write → read**. Admin to `PERMANENT`, zawsze `KEEP` | ADR 0008 zamienił „zapomnianego admina” Kamila na `write`; seed i UC-2 |
| D2 | Szkic: tabela na oknie 30 dni dla każdego statusu daje `kamil@payment-service = KEEP`; UC-2, fixtures, seed: `WARNING + DOWNSCOPE` | Rekomendacja = **status + najnowsza akcja odnawiająca** (§3.3) | Spełnia UC-2, UC-3, fixtures i oracle Osoby 2; świeży onboarding dostaje `KEEP` (O1) |
| D3 | `LeaseStatus` ma 3 wartości, a lista obejmuje adminów i odebrane dostępy (O2) | Dochodzą **`PERMANENT`** i **`REVOKED`** | Jednoznaczny kontrakt; liczniki i graf Osoby 4 i tak patrzą na rolę i `is_active` |
| D4 | UC-5 zakłada 204 przy usuwaniu właściciela organizacji; mock Osoby 2 daje 403 | Reguła z mocka, **jedna** dla mocka, adaptera i silnika (§4); kroki 3–4 UC-5 poprawione w 3.6 | Zachowanie mocka i jego testy bez zmian |
| D5 | Scenariusze liczą `days_remaining` w dół, `lease_window.py` w górę; UC-4 w t30 oczekuje `KEEP` | Zostaje zaokrąglenie **w górę**; scenariusze poprawione w 3.6 | `WARNING` ⇔ 1–7 dni, `EXPIRED` ⇔ ≤ 0; zgodne z planem seedu (3 i 5 dni) |
| D6 | 3.4 ma być osobnym PR-em | Osobna gałąź z `main`, lokalny merge przed 3.5, bez pusha | PR 3.4 można scalić pierwszy |
| D7 | `activity-stats` (Osoba 5, Prelint) poza listą | Dodany w 3.6 | Modal decyzji pokazuje dowód użycia |
| D8 | Szkic: uzasadnienie zawsze; kontrakt: opcjonalne | **Wymagane dla `DOWNSCOPE`/`REVOKE`** (422 z serwisu), opcjonalne dla `EXTEND` | Fixtures i UC-3 wysyłają `EXTEND` bez uzasadnienia; tryb auto wpisuje powód sam |
| D9 | Szkic: `disabled` poza MVP; lista: `disabled / warning / auto` | Trzy tryby (§5) | Lista kroków |
| D10 | Szkic: `revoked_at`; model: `is_active` | `is_active` | ADR 0007 |
| D11 | Tryb auto a odwołanie `PENDING` | Auto **nie pomija** takich dzierżaw | Żaden dostęp nie jest wieczny; `EXTEND` na odwołaniu przywraca dostęp |
| D12 | Mnożnik: szkic liczy `expires_at − granted_at`; GLOSSARY: TTL = okres dzierżawy | Mnożnik od TTL repozytorium: `+ round(lease_days × M)` dni | W seedzie `granted_at` jest 90 dni wstecz, więc szkic dawałby 2× ≈ 240 dni |
| D13 | Decyzja na dzierżawie z odwołaniem `PENDING` | `/leases/{id}/decision` → 409; decyzja idzie przez `/appeals/{id}/decision` | Odwołanie nie zostaje bez rozstrzygnięcia (ADR 0011 §5.5) |
| D14 | `until_date` jest datą, nie czasem | Dostęp do końca dnia D (UTC): `expires_at = (D + 1 dzień) 00:00Z` | Jednoznaczne dla admina i testów |

D12–D14 to decyzje sekcji 3.6 przyjęte według rekomendacji, do zgłoszenia uwag przed scaleniem 3.6.

## 3. Reguły (3.1–3.3) — `app/domain/lease_rules.py`

### 3.1 Status dzierżawy

Pierwsza pasująca reguła wygrywa (`now` z `ClockPort`):

1. `is_active = false` → `REVOKED`
2. `current_role = admin` albo brak `expires_at` → `PERMANENT`
3. `expires_at <= now` → `EXPIRED`
4. `expires_at − now <= 7 dni` → `WARNING` (`WARNING_WINDOW_DAYS` z `app/domain/lease_window.py`)
5. w przeciwnym razie → `ACTIVE`

`days_remaining` = `lease_window.days_remaining` (zaokrąglenie w górę) dla `ACTIVE`/`WARNING`/`EXPIRED`, `null` dla `PERMANENT`/`REVOKED`.
Dzięki temu `WARNING` ma zawsze 1–7 dni, a `EXPIRED` ≤ 0.

### 3.2 Macierz odnawiania

Liczą się tylko akcje z `RENEWING_ACTIONS` (ADR 0010). Akcja odnawia swój poziom i niższe, nie wyższe. Admin nie wygasa, więc nie jest odnawiany.

| Akcja ↓ / dzierżawa → | `read` | `write` |
| --- | --- | --- |
| `PushEvent` (write) | ✅ | ✅ |
| `PullRequestReviewEvent`, `IssueCommentEvent` (read) | ✅ | ❌ |
| merge, label, zmiana ustawień (tylko mock) | ❌ | ❌ |

`record_activity(session, *, user_id, repo_id, action, occurred_at)` zapisuje `ActivityEvent` (tylko dopisywanie) z
`required_permission_for(action)`. Jeśli akcja odnawia aktywną dzierżawę nie-admin tej osoby w tym repo, ustawia
`expires_at = max(expires_at, occurred_at + lease_days)`, więc nigdy nie skraca przedłużenia admina. Seed (`app/db/seed.py`)
liczy `expires_at` tą samą regułą; zgodność pilnuje test.

### 3.3 Rekomendacja i ostatnia aktywność

- `REVOKED`, `PERMANENT`, `ACTIVE` → `KEEP`.
- `WARNING`, `EXPIRED`: najnowsza akcja odnawiająca tej osoby w tym repo w oknie `[now − lease_days, now]`:
  - brak → `REVOKE`;
  - odnawia rolę dzierżawy (macierz §3.2) → `KEEP`;
  - nie odnawia (review lub komentarz przy `write`) → `DOWNSCOPE` (do `read`).
  - Przy równym czasie wygrywa wyższy poziom.
- `last_activity_at` = czas najnowszej akcji odnawiającej (bez okna, nie później niż `now`), `null` gdy brak.
- W trybie `disabled` rekomendacja to zawsze `KEEP` (§5).

Kontrola na seedzie (reset, godzina popołudniowa):

| Dzierżawa | t0 | +15 dni | +30 dni |
| --- | --- | --- | --- |
| `kamil@core-api` | `ACTIVE`, 29, `KEEP` | `ACTIVE`, `KEEP` | `EXPIRED`, `REVOKE` |
| `kamil@payment-service` (UC-2) | `WARNING`, 5, `DOWNSCOPE` | `EXPIRED`, `DOWNSCOPE` | `EXPIRED`, `REVOKE` |
| `kamil@frontend-app`, `kamil@notifications` | `EXPIRED`, `DOWNSCOPE` | | |
| `kamil` w 5 zapomnianych repo | `EXPIRED`, `REVOKE` | | |
| `marta@qa-automation` (UC-3) | `WARNING`, 3, `KEEP` | `EXPIRED`, `REVOKE` | |
| `tomasz-admin` | `PERMANENT`, `null`, `KEEP` | | |

## 4. Ochrona ostatniego admina (3.4)

Reguła (jak w mocku Osoby 2, ADR 0004):

- **repozytorium:** nie da się usunąć ani zdegradować ostatniej aktywnej dzierżawy `admin` w repo;
- **organizacja:** jedynego właściciela organizacji (`User.is_admin`) nie da się usunąć z żadnego repo ani zdegradować jego `admin`.

| Element | Rola |
| --- | --- |
| `LastAdminError(ServiceError)` w `app/services/errors.py` | 403 z komunikatem jak w mocku (`...of the organization` / `...of the repository`) |
| `ensure_not_last_admin(session, *, repository, user, lease)` w `app/services/last_admin_guard.py` | jedyne źródło reguły; tylko sprawdza, audytu nie zapisuje |
| `GitHubCollaboratorService` (mock Osoby 2) | woła wspólną regułę i tłumaczy błąd na `GitHubError(403)` |
| `VCSProvider.remove_collaborator(owner, repo, username)` | nowa metoda portu (ADR 0011 §3) |
| `DatabaseVCSAdapter.remove_collaborator` | `is_active = false` za strażnikiem; ponowne wywołanie nic nie zmienia |

Wpis `LAST_ADMIN_BLOCKED` w audycie zapisuje ten, kto próbował odebrać dostęp (decyzja admina albo tryb auto).

## 5. Tryby egzekwowania (3.5)

`EnforcementMode`: `disabled`, `warning` (domyślny), `auto`. Tryb jest trzymany w pamięci procesu, jak przesunięcie zegara.
Reset demo przywraca `warning`. Zmiana trybu trafia do audytu jako `ENFORCEMENT_MODE_CHANGED`.

| Tryb | Status i dni | Rekomendacje | Akcje automatyczne |
| --- | --- | --- | --- |
| `disabled` | liczone | zawsze `KEEP` (bez powiadomień) | brak |
| `warning` | liczone | liczone | brak, decyduje admin |
| `auto` | liczone | liczone | po każdym `POST /api/v1/simulation/time-travel` i od razu po przełączeniu na `auto` |

Przebieg `auto` (`run_auto_enforcement`): każda aktywna dzierżawa nie-admin ze statusem `EXPIRED` i rekomendacją `DOWNSCOPE`
albo `REVOKE` dostaje tę akcję. Aktor `SYSTEM` (`actor_id = null`), uzasadnienie wpisane automatycznie. `LastAdminError`
→ wpis `LAST_ADMIN_BLOCKED` i przejście do następnej dzierżawy. Drugi przebieg nic nie zmienia. `GET` nigdy niczego nie wykonuje.

API: `GET /api/v1/enforcement/mode` → `{"mode": "warning"}`, `PUT /api/v1/enforcement/mode` z `{"mode": "auto"}`.

## 6. API (3.6)

| Metoda i ścieżka | Body | Odpowiedź |
| --- | --- | --- |
| `GET /api/v1/leases` | — | `LeaseOverview[]` (wszystkie dzierżawy, także admin i odebrane), po `id` |
| `GET /api/v1/leases/{id}` | — | `LeaseOverview`; 404 |
| `POST /api/v1/leases/{id}/decision` | `DecisionRequest` | `LeaseOverview` po decyzji |
| `GET /api/v1/leases/{id}/activity-stats` | — | `LeaseActivityStats`: liczniki push / review / komentarzy w oknie dzierżawy |

Błędy `POST /decision`: 404 brak dzierżawy; 409 dzierżawa ma odwołanie `PENDING` (D13) albo `REVOKE` na odebranej;
422 `EXTEND`/`DOWNSCOPE` na adminie, `DOWNSCOPE` nie z aktywnego `write`, brak uzasadnienia przy `DOWNSCOPE`/`REVOKE` (D8),
`until_date` nie później niż obecny koniec dzierżawy; 403 ostatni admin (wpis `LAST_ADMIN_BLOCKED` zostaje w audycie).

`EXTEND` (`apply_lease_decision`):

- baza = `max(now, expires_at)` dla aktywnej dzierżawy, `now` dla odebranej;
- `preset_days` / `custom_days` = N → `baza + N dni`;
- `multiplier` = M → `baza + round(lease_days × M)` dni (D12);
- `until_date` = D → `(D + 1 dzień) 00:00Z` (D14);
- odebrana dzierżawa wraca przez `VCSProvider.set_permission` (dostaje `granted_at = now`).

`DOWNSCOPE`: tylko z aktywnego `write`, przez port: `read`, `granted_at = now`, `expires_at = now + lease_days`.
`REVOKE`: przez `VCSProvider.remove_collaborator`.

Audyt: `LEASE_EXTENDED` / `LEASE_DOWNSCOPED` / `LEASE_REVOKED`, aktor `ADMIN` (`actor_id`) albo `SYSTEM` (`null`), cel
`owner/repo:login`, `details` z rolą i końcem dzierżawy przed i po.

## 7. Moduły

```
backend/app/domain/       lease_rules.py (status, dni, macierz, rekomendacja, przedłużenie)
backend/app/core/         enforcement_mode.py (tryb w pamięci procesu)
backend/app/services/     lease_service.py, decision_service.py, enforcement_service.py, last_admin_guard.py
backend/app/api/v1/       leases.py, enforcement.py
```

## 8. Testy i weryfikacja

```bash
cd backend
uv run pytest -q
uv run python scripts/export_contract.py
npx --yes json-schema-to-typescript@15 -i contract/schema.json -o ../frontend/src/types/api.ts --unreachableDefinitions --additionalProperties=false --bannerComment "/* AUTO-GENERATED from backend/contract/schema.json - do not edit. Regenerate: see backend/README.md */"
```

Testy silnika: `tests/domain/test_lease_status.py`, `test_renewal_matrix.py`, `test_recommendation.py`, `test_extension.py`,
`tests/services/test_record_activity.py`, `test_lease_overviews.py`, `test_last_admin_guard.py`, `test_decision_downscope_revoke.py`,
`test_enforcement_service.py`, `test_apply_decision.py`, `tests/api/test_enforcement_api.py`, `test_leases_api.py`,
`test_leases_demo.py` (seed przez prawdziwe API: UC-2…UC-5).

Na `main` przed rozpoczęciem: `295 passed, 2 failed`. Oba błędy to `tests/repo/test_docs_integrity.py` (dwa ADR-y z numerem 0011);
nie dotyczą silnika i są zgłoszone jako osobne zadanie.

## 9. Stan kroków

| Krok | Co | Stan |
| --- | --- | --- |
| 3.1 | Status dzierżawy względem zegara | ✅ `lease_rules.lease_status`, `LeaseStatus` + `PERMANENT`/`REVOKED` |
| 3.2 | Macierz odnawiania | ✅ `lease_rules.renews`, `lease_service.record_activity`; seed zgodny z macierzą (test) |
| 3.3 | Wykrywanie deeskalacji write → read | ✅ `lease_rules.recommend`, `lease_service.list_lease_overviews` / `get_lease_overview` |
| 3.4 | Ochrona ostatniego admina | ✅ `last_admin_guard.ensure_not_last_admin`, `VCSProvider.remove_collaborator` (gałąź `guziol/ochrona-ostatniego-admina`) |
| 3.5 | Tryby disabled / warning / auto | ✅ `enforcement_service` (`run_auto_enforcement`, `change_mode`), `decision_service` (`downscope_lease`, `revoke_lease`), `GET/PUT /api/v1/enforcement/mode`, hook w `POST /simulation/time-travel` |
| 3.6 | Endpointy | ✅ `GET /api/v1/leases`, `GET /api/v1/leases/{id}`, `POST /api/v1/leases/{id}/decision`, `GET /api/v1/leases/{id}/activity-stats`; `decision_service.apply_lease_decision`; poprawione scenariusze UC-2…UC-5 |

## 10. Notatki dla zespołu

**Osoba 4 (Durczkos).**
- Oba punkty styku z ADR 0011 §6 istnieją pod tymi samymi nazwami. `list_lease_overviews(session, now)` ma dodatkowo
  opcjonalny argument `mode` (domyślnie bieżący tryb), a `apply_lease_decision` przyjmuje też `actor_id=None` (aktor `SYSTEM`).
- `LeaseStatus` ma teraz `PERMANENT` i `REVOKED`; Twoje zerowanie statusu dla admina i nieaktywnych w `_snapshot` dalej działa.
- `apply_lease_decision` przy blokadzie ostatniego admina zapisuje (flush) wpis `LAST_ADMIN_BLOCKED` i rzuca `LastAdminError` (403).
  Żeby wpis został w bazie, router musi zrobić `commit` przed ponownym rzuceniem błędu (tak robi `POST /api/v1/leases/{id}/decision`).
- `DOWNSCOPE`/`REVOKE` bez uzasadnienia → 422 (D8); `/leases/{id}/decision` odsyła dzierżawy z odwołaniem `PENDING` na `/appeals/{id}/decision` (409).
- O1 i O2 z ADR 0011 są rozstrzygnięte (D2, D3).

**Osoba 2 (Dawid).** `_guard_last_admin` w `GitHubCollaboratorService` woła teraz wspólne `ensure_not_last_admin`
(odpowiedzi i testy mocka bez zmian). `POST /api/v1/simulation/time-travel` w trybie `auto` uruchamia `run_auto_enforcement`.
Port `VCSProvider` ma `remove_collaborator`; adapter na Twoim mocku musi go zaimplementować.

**Osoba 5 (Kubuś).** Endpointy w §6, typy w `frontend/src/types/api.ts`: `LeaseOverview`, `LeaseStatus` (5 wartości),
`LeaseActivityStats`, `EnforcementMode`, `EnforcementModeRead`, `EnforcementModeUpdate`. Badge statusu potrzebuje kolorów dla `PERMANENT` i `REVOKED`.

**Osoba 6 (Sydor).** Poprawione scenariusze: uc-02 (5 i 29 dni), uc-03 (3 dni), uc-04 (29 dni, w t30 `REVOKE`),
uc-05 (PUT kamila daje 204, bo kamil już ma `write`; potem usunięcie kamila 204, tomasza 403). Wartości dni zakładają zegar
po 10:00 UTC w dniu seeda (np. 12:00). `shared/fixtures/leases*.json` mają dni liczone w dół i statusy tylko z 3 wartości; są
poglądowe, więc ich nie ruszałem. Punkty kontrolne oracle z `tests/integration/test_github_mock_contract.py` (kamil@core-api, kamil@payment-service, marta@qa-automation po 0, +15 i +30 dniach) silnik daje te same (test `test_lease_overviews.py`).
