# ADR 0008: Interfejs TimeProvider, deterministyczny seed i reset demo

**Status:** Proponowany (do akceptacji zespołu) · **Autor:** Kocik (Osoba 1) · **Data:** 2026-10-03
**Doprecyzowuje:** ADR 0003, Zadania 2, 4 i 11 planu zespołu

## Kontekst

- Nazwa metody zegara jest niespójna: ADR 0003 mówi `time_provider.now()`, a `CODING_STANDARDS.md` i plan zespołu — `get_current_time()`.
- Seed ma być deterministyczny i idempotentny, a scenariusze („wygasa za 3 dni”, „brak pushy od 25 dni”) mają działać niezależnie od dnia uruchomienia.
- Na scenie demo musi dać się jednym wywołaniem wrócić do stanu startowego.
- `PRODUKT.md` mówi, że Kamil ma „zapomnianego admina” w 8 repo, ale ADR 0002 wyłącza `admin` z wygasania — tak opisana persona nie pokazałaby niczego w demo.

## Decyzja

1. **Port i adapter zegara** (zgodnie z `CODING_STANDARDS.md`: `ports/`, oraz Zadaniem 2 planu zespołu: `core/time_provider.py`):
   - Port: `ClockPort` (`typing.Protocol`) w `app/ports/clock.py` — z niego korzysta logika domenowa.
   - Adapter: `TimeProvider` w `app/core/time_provider.py` (to jest `SimulatedClockAdapter` z `PLAN.md`) oraz globalna instancja `time_provider` i zależność FastAPI `get_time_provider()`.
   - Metody:
     - `get_current_time() -> datetime` — UTC ze strefą = czas bazowy + offset.
     - `advance(days: int) -> datetime` — przesuwa offset, zwraca nowy czas.
     - `reset() -> None` — zeruje offset.
     - `offset_days: int` (tylko odczyt).
     - Nazwa `now()` z ADR 0003 nie jest używana.
2. **Offset trzymamy w pamięci procesu** (jeden proces uvicorna w demo). Czas bazowy to domyślnie zegar systemowy UTC; testy wstrzykują stały czas (`base_time_source`).
3. **Seed liczy wszystkie daty względem `anchor`** = `get_current_time()` w chwili seedowania, obciętego do północy UTC. Scenariusz „wygasa za 3 dni” jest więc zawsze prawdziwy zaraz po seedzie. Idempotencja: seed nic nie robi, jeśli w bazie jest już organizacja (`tomasz-admin`).
4. **Persony w seedzie:**
   - `tomasz-admin` — admin IT, `is_admin = True`, `admin` we wszystkich repo (stały, chroniony Last Admin Protection).
   - `kamil` (DEV) — `write` w 2 repo z codziennymi `PushEvent`; `write` w 8 innych repo bez pushy (część tylko z review/komentarzami → kandydat do down-scope, część bez zdarzeń → kandydat do revoke). Tym zastępujemy „zapomnianego admina” z `PRODUKT.md` przy zachowaniu ADR 0002.
   - `marta` (QA) — `read` w repo QA z `IssueCommentEvent`/`PullRequestReviewEvent`; jeden dostęp wygasa za 3 dni (scenariusz B, okno ostrzegawcze).
   - Scenariusze A–D z `PLAN.md` są pokryte przez Kamila (A), Martę (B), repo `legacy-reports` bez zdarzeń (C) i `nowy-dev` bez dostępów (D).
5. **Reset demo:** `POST /api/v1/demo/reset` usuwa i tworzy schemat, zeruje offset zegara i uruchamia seed; zwraca liczności tabel i aktualny czas. Endpoint działa tylko przy `ENABLE_DEMO_RESET=true` (domyślnie `true`), inaczej zwraca 404.

## Konsekwencje

- Zadanie 2 planu zespołu i `CODING_STANDARDS.md` są zgodne z tym interfejsem bez zmian; ADR 0003 należy czytać z `get_current_time()` zamiast `now()`.
- Seed jest powtarzalny w testach (stały czas bazowy) i sensowny w każdej dacie demo.
- Endpoint `POST /api/v1/simulation/time-travel` (Zadanie 11) korzysta z tego samego obiektu zegara.
- Opis persony Kamila w `PRODUKT.md` warto poprawić na „`write` w 8 nieużywanych repo”.
