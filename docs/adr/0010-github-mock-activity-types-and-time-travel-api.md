# ADR 0010: Mock GitHuba: typy aktywności tylko dla mocka i API time-travel

- Status: przyjęty
- Rozszerza: ADR 0006 (model ról), ADR 0008 (TimeProvider, seed)
- Dotyczy: `backend/app/api/github_mock`, `backend/app/api/v1/simulation.py`, `backend/app/db/activity_extras.py`

## Kontekst

Zadanie 2 (mock GitHuba i aktywność) wymaga zdarzeń: push, merge, review, label i zmiana ustawień. ADR 0006 zna tylko trzy
`ActionType` (push, review, komentarz), czyli dokładnie te, które odnawiają dzierżawę (ADR 0002). Mock ma jednak
wyglądać jak prawdziwy strumień `/events`, a silnik dzierżaw nie może traktować merge'a ani labela jako dowodu użycia dostępu.

## Decyzja

1. `ActionType` dostaje trzy wartości: `PR_MERGE="PullRequestEvent"` (write), `ISSUE_LABEL="IssuesEvent"` (read),
   `REPO_SETTINGS="PublicEvent"` (admin; GitHub nie ma publicznego typu „zmiana ustawień”). Wymagane poziomy są w `_REQUIRED_PERMISSION`.
2. **Odnawiają dzierżawę wyłącznie** akcje z `domain.roles.RENEWING_ACTIONS` (push, review, komentarz); pomocnik `is_renewing(action)`.
   Silnik dzierżaw i baseline mają filtrować po tym zbiorze, a nie po „wystarczającym poziomie”.
3. Typy mock-only są dokładane przez `seed_activity_extras` (po `seed_demo_data`, w `prepare_database`), deterministycznie
   (stałe ziarno, godziny względem zegara) i idempotentnie. Seed kocika (scenariusze A–D, liczności baseline) pozostaje nietknięty;
   `legacy-reports` (scenariusz C) zostaje bez zdarzeń.
4. Collaborator = **aktywny** `Lease`. `DELETE` ustawia `is_active=False` (wiersz zostaje do audytu), ponowny `PUT` reaktywuje ten sam wiersz
   (unikalność `user_id+repo_id`, ADR 0007) i zwraca `201`.
5. Time-travel trzyma kontrakt z ADR 0009: `POST /api/v1/simulation/time-travel {days}` → `ClockRead{now, offset_days}`,
   `GET` zwraca stan, `DELETE` wraca do czasu rzeczywistego (bez ruszania danych; pełny reset to `/api/v1/demo/reset`).
6. Mock korzysta z istniejącego DI (`get_session`, `get_settings`, `get_time_provider`); nie tworzy własnego stanu aplikacji.

## Konsekwencje

- Zmiana enumu wymaga regeneracji `contract/schema.json` i `frontend/src/types/api.ts` (ADR 0009). Migracja Alembic nie jest potrzebna
  (enum zapisywany jako VARCHAR, `test_migrations_match_models` zielony).
- Kto czyta `activity_events` (silnik, baseline), musi filtrować `RENEWING_ACTIONS`.
