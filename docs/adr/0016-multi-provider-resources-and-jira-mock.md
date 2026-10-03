# ADR 0016: Wielu dostawców (`provider`) i mock Jiry

- Status: przyjęty
- Rozszerza: ADR 0006 (model ról), ADR 0007 (model danych), ADR 0010 (typy aktywności)
- Dotyczy: `repositories.provider`, `backend/app/api/jira_mock`, `backend/app/services/access_leases.py`

## Kontekst

Drugi dostawca obok GitHuba ma dowieść, że rdzeń (dzierżawy, silnik, panel) nie zależy od dostawcy. Jira nie ma strumienia zdarzeń
ani "collaboratorów": ma role projektowe i zgłoszenia. Trzeba było zdecydować, jak zapisać projekt Jiry bez przebudowy modeli z zadań 1.x.

## Decyzja

1. **`repositories.provider`** (`github` domyślnie, `jira`), migracja `0002`. Projekt Jiry to wiersz z `name=KEY`, `owner=<jira_site>`.
   Zmiana addytywna; istniejący kod i dane bez zmian. Każdy mock filtruje po swoim dostawcy, więc projekty nie mieszają się z repozytoriami.
2. **Role:** Viewer=`read`, Member=`write`, Administrator=`admin` (ADR 0006 bez zmian, `domain/jira_roles.py`). `admin` jest stały jak w GitHubie.
3. **Zdarzenia Jiry** w `ActionType` (nazwy z webhooków Jiry): `jira:issue_created` i `jira:issue_updated` (write), `comment_created` (read),
   `project_updated` (admin). Odnawiają dzierżawę trzy pierwsze (`RENEWING_ACTIONS`); zmiany administracyjne nie.
4. **Dowód użycia przez prawdziwe endpointy Jiry** (wyszukiwanie JQL, changelog, komentarze, audit records), a nie własny `/events`.
   Dane są wyliczane z `ActivityEvent`; issue to seria trzech kolejnych zdarzeń (reguła w `domain/jira_events.py`, seed musi ją respektować).
5. **Wspólna logika leasów:** `AccessLeaseService` (grant / revoke / Last Admin Protection) używają oba mocki. `DELETE`/usunięcie aktora
   ustawia `is_active=False`, ponowne nadanie reaktywuje ten sam wiersz.
6. **JQL:** wąski, jawnie ograniczony podzbiór (`project`, `updated >=`, `assignee|reporter|commenter =`, `AND`, `ORDER BY`). Reszta daje `400` w formacie Jiry.

## Konsekwencje

- Kto czyta `repositories` lub `activity_events` (silnik, baseline, panel), musi filtrować po `provider`, inaczej zmiesza GitHuba z Jirą.
- Zmiana enumu wymagała regeneracji `contract/schema.json` i `frontend/src/types/api.ts` (ADR 0009).
- Port `AccessProvider` (zamiast `VCSProvider` z PLAN.md) nie jest jeszcze zaimplementowany w kodzie; nazwa ma być użyta przy pierwszym porcie.
- Reguła "issue = trzy kolejne zdarzenia" jest ograniczeniem seeda mocka, nie modelu produkcyjnego (prawdziwy adapter Jiry czytałby prawdziwe zgłoszenia).


## Uzgodnienie z Last Admin Protection (ADR 0014 §2)

Zapis dzierżaw dla mocków GitHuba i Jiry (`AccessLeaseService`) korzysta z jednej reguły `last_admin_guard.ensure_not_last_admin`, tej samej co `DatabaseVCSAdapter` i silnik dzierżaw. Błąd `LastAdminError` (403) mock GitHuba oddaje w formacie GitHuba, a mock Jiry w formacie Jiry, z komunikatem "project" zamiast "repository".
