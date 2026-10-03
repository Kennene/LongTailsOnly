# ADR 0013: Prelint jako pamięć decyzji i straż ADR-ów w procesie PR

**Status:** Proponowany (do akceptacji zespołu) · **Autor:** Sydor (Osoba 6) · **Data:** 2026-10-03
**Doprecyzowuje:** `AGENTS.md`, krok 6.0 planu zespołowego

## Kontekst

Projekt buduje sześć osób równolegle i ma trwać jeden hackathon. Uzasadnienia decyzji rozpraszają się między czatem, komentarzami w PR i pamięcią uczestników. Repozytorium ma już dziewięć ADR-ów, ale nic nie wymusza, żeby autor zmiany je sprawdził — naruszenie decyzji wychodzi dopiero na prezentacji.

Widać to już w praktyce: gałąź Osoby 6 niezależnie utworzyła ADR 0006–0008, czyli dokładnie te same numery co ADR-y Osoby 1, z zupełnie inną treścią. Kolizja numeracji została wykryta dopiero przy scalaniu.

Kategoria Defence premiuje użycie Prelinta, więc narzędzie jest jednocześnie wymogiem procesowym i elementem oceny.

## Decyzja

1. **Prelint podpięty od pierwszej minuty.** `.mcp.json` jest **śledzony w git** i deklaruje serwer MCP `prelint`. Każdy agent dostaje pamięć decyzji po samym sklonowaniu repozytorium.

2. **Zapis decyzji.** Każda ustalona decyzja produktowa trafia przez `ingest_text` w całości — z uzasadnieniem i odrzuconymi opcjami, nie jako jednowierszowe streszczenie. Nowy i zmieniony ADR jest wysyłany tą samą drogą.

3. **Odczyt przed propozycją.** Przed zaproponowaniem zachowania produktu sprawdzamy `search_statements` i `list_glossary_terms`. Przed nazwaniem czegokolwiek sprawdzamy słownik.

4. **Straż ADR-ów w każdym PR.** `.github/pull_request_template.md` zawiera listę kontrolną z jawnym punktem: które ADR-y PR dotyczy, czy naruszono decyzję, czy potrzebny nowy ADR. Autor musi rozstrzygnąć to świadomie.

5. **Indeks ADR-ów jest obowiązkowy i pilnowany automatycznie.** `docs/adr/README.md` wymienia wszystkie ADR-y; sprawdzenie w testach weryfikuje, że każdy plik `docs/adr/NNNN-*.md` występuje w indeksie, a numeracja jest unikalna. Osierocony ADR nie przejdzie.

6. **Numer ADR-a przydzielamy przed pisaniem.** Przed utworzeniem ADR-a sprawdzamy `origin/main` (`git ls-tree origin/main -- docs/adr`), żeby nie powtórzyć kolizji 0006–0008.

7. **Sprawdzenia repo-owe żyją w `backend/tests/repo/`.** Nie tworzymy osobnego projektu `tools/`: backend już istnieje, a zespół uruchamia jeden zestaw poleceń (`uv run pytest`, `pytest`). Sprawdzenia te czytają pliki spoza `backend/` (ADR-y, `shared/`) wyliczając katalog główny repozytorium z `__file__`.

## Konsekwencje

- **Zalety**: decyzje i ich uzasadnienia przeżywają sesję i zmianę autora; naruszenie ADR-u widać w PR, a nie na demo; kolizja numeracji jest wykrywana zanim trafi do scalenia; jedno polecenie testowe dla całego zespołu.
- **Koszt**: lista kontrolna w PR to dodatkowy krok — celowo jedno pytanie, nie formularz.
- **Ryzyko**: lista kontrolna może degradować się do odhaczania bez czytania. Kompensuje to wymóg podania numeru ADR-a albo jawnego „nie dotyczy".
- **Odrzucone**: osobny projekt `tools/` na sprawdzenia repo-owe (drugi venv i drugie polecenie dla zespołu), poleganie na dobrej woli autora PR, przydzielanie numerów ADR-ów bez sprawdzania `origin/main`.
