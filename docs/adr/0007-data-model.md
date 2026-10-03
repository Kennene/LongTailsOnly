# ADR 0007: Model danych (tabele, nazwy pól, czas UTC)

**Status:** Proponowany (do akceptacji zespołu) · **Autor:** Kocik (Osoba 1) · **Data:** 2026-10-03
**Doprecyzowuje:** `PLAN.md` (Faza 1 pkt 2), Zadanie 3 planu zespołu, ADR 0002, ADR 0006

## Kontekst

`PLAN.md` i plan zespołu podają różne nazwy pól (`event_type` vs `action_type`, `required_level` vs `required_permission`) i trzymają zespół jako tekst w `User.team`. Podział pracy zakłada model `Team` (graf uprawnień i baseline operują na zespołach). SQLite nie przechowuje strefy czasowej, a cała logika dzierżaw porównuje daty.

## Decyzja

1. **Nazwy pól bierzemy z planu zespołu** (to on jest wykonywany): `action_type`, `required_permission`, `timestamp`, `current_role`.
2. **Zespół to osobna tabela** `teams`, a `users.team_id` jest kluczem obcym (nullable — admin IT nie musi mieć zespołu). Odrzucone: `User.team: str` (brak miejsca na nazwę/węzeł grafu, literówki w danych).
3. **Tabele** (wszystkie klucze to `int` autoincrement):

   | Tabela | Pola |
   | --- | --- |
   | `teams` | `id`, `slug` (unikalny, `dev`/`qa`), `name` |
   | `users` | `id`, `login` (unikalny), `name`, `team_id` → teams (nullable), `is_admin` (admin organizacji) |
   | `repositories` | `id`, `name` (unikalny), `owner`, `default_branch`, `default_lease_duration_days` (domyślnie 30) |
   | `leases` | `id`, `user_id`, `repo_id`, `current_role`, `granted_at`, `expires_at` (NULL dla `admin`), `is_active`; unikalne (`user_id`, `repo_id`) |
   | `activity_events` | `id`, `user_id` (indeks), `repo_id` (indeks), `timestamp` (indeks), `action_type`, `required_permission` |
   | `appeals` | `id`, `lease_id`, `user_id`, `repo_id`, `requested_role`, `justification`, `status`, `created_at`, `resolved_at` (nullable) |
   | `audit_logs` | `id`, `timestamp`, `actor_type`, `actor_id` (nullable dla `SYSTEM`), `action`, `target`, `details` (JSON), `justification` (nullable) |

4. **Jedna dzierżawa na parę użytkownik–repozytorium.** Down-scope zmienia `current_role`, revoke ustawia `is_active = False` (wiersz zostaje dla historii i grafu).
5. **`activity_events` i `audit_logs` są tylko do dopisywania** (append-only) — żaden kod nie robi na nich `UPDATE`/`DELETE` (poza resetem demo, ADR 0008).
6. **Czas zawsze w UTC ze strefą.** Kolumny dat używają typu `UTCDateTime` (`TypeDecorator` w `app/db/types.py`), który przy zapisie odrzuca daty bez strefy, a przy odczycie dokleja `UTC`. Dzięki temu porównania `expires_at < now` nie wybuchają błędem „naive vs aware”.
7. **Organizacja nie ma osobnej tabeli** — w MVP jest dokładnie jedna (`PRODUKT.md`, M7). Jej login to ustawienie `GITHUB_ORG` (domyślnie `longtails`) i trafia do `repositories.owner`; admini organizacji to `users.is_admin = True`.
8. Enumy zapisujemy jako tekst (`Enum(..., native_enum=False)`), wartości z ADR 0006.
9. **Schemat zmieniamy wyłącznie migracjami Alembic** (`backend/alembic/versions/`, tryb `render_as_batch` dla SQLite). `init_db()` = `alembic upgrade head`, reset demo = `downgrade base` + `upgrade head`. Każda zmiana modeli ⇒ nowa migracja (`uv run alembic revision --autogenerate -m "..."`), przejrzana ręcznie. Test `test_migrations_match_models` porównuje migracje z modelami i pada, gdy ktoś zmieni model bez migracji.

## Konsekwencje

- Zadanie 3 planu zespołu: test `test_models_persist_required_fields` sprawdza `User.team_id` zamiast `User.team`.
- Wszyscy dostają w pełni typowane modele `Mapped[...]` z relacjami (`lease.user`, `lease.repository`, `user.team`).
- Dochodzi zależność `alembic`; każda osoba zmieniająca modele dołącza do PR plik migracji. Testy budują bazę tymi samymi migracjami co produkcja, więc błędna migracja wychodzi w CI, a nie na scenie.
