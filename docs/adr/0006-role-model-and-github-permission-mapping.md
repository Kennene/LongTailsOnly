# ADR 0006: Model ról w domenie i mapowanie na uprawnienia GitHuba

**Status:** Proponowany (do akceptacji zespołu) · **Autor:** Kocik (Osoba 1) · **Data:** 2026-10-03
**Doprecyzowuje:** ADR 0002 · **Zastępuje:** hierarchię `admin > maintain > push > triage > pull` z planu `docs/superpowers/plans/2026-10-03-github-access-lease-governor.md` (Zadania 5 i 8)

## Kontekst

Dokumenty są sprzeczne:
- ADR 0002 i `GLOSSARY.md`: wygasaniu podlegają **dwa poziomy** `write` > `read`; `admin` jest stały (break-glass), wyłączony z wygasania. Pięciostopniowa hierarchia została w ADR 0002 **jawnie odrzucona** dla MVP.
- Plan zespołu (Zadanie 5): enum `Role` z pięcioma poziomami `admin > maintain > push > triage > pull`, a Zadanie 8 zawiera test `test_admin_activity_renews_admin_lease`, który zakłada, że `admin` wygasa.

Oba stwierdzenia są oznaczone w Prelint jako zaakceptowane. Schematy (zadanie 1.2) i modele (zadanie 1.3) muszą wybrać jedną wersję.

## Decyzja

1. **Domena używa trzech wartości `Role`: `read`, `write`, `admin`** (porządek `read < write < admin`).
   - Objęte wygasaniem (wygasające): `read`, `write`.
   - `admin`: stały. Dostęp `admin` ma `expires_at = NULL` i nigdy nie przechodzi w `WARNING`/`EXPIRED`.
2. **Nazwy GitHuba żyją tylko na granicy mocka** (`/api/v3/...`) jako `GitHubPermission`: `pull`, `triage`, `push`, `maintain`, `admin`. Mapowanie:

   | GitHub → domena | domena → GitHub |
   | --- | --- |
   | `pull`, `triage` → `read` | `read` → `pull` |
   | `push`, `maintain` → `write` | `write` → `push` |
   | `admin` → `admin` | `admin` → `admin` |

3. **Typ zdarzenia wyznacza wymagany poziom** (`ActivityEvent.required_permission` zapisywane przy tworzeniu zdarzenia):
   - `PushEvent` → `write`
   - `PullRequestReviewEvent`, `IssueCommentEvent` → `read`
4. **Reguła odnowienia** pozostaje asymetryczna (ADR 0002): zdarzenie odnawia dostęp, gdy `required_permission >= current_role`; dotyczy to tylko `read`/`write`.
5. Test `test_admin_activity_renews_admin_lease` z Zadania 8 planu zespołu zastępujemy testem `test_admin_lease_never_expires`.

## Konsekwencje

- Jedno źródło prawdy: `backend/app/domain/roles.py` (enumy + funkcje mapujące); frontend dostaje te same wartości przez wygenerowane typy (ADR 0009).
- Mock GitHuba zwraca autentyczne nazwy (`push`, `pull`), a rdzeń nie wie o `maintain`/`triage` — dodanie ich post-MVP to zmiana tylko w mapowaniu.
- Osoby realizujące Zadania 5 i 8 planu zespołu muszą użyć tego modelu zamiast pięciu ról.
