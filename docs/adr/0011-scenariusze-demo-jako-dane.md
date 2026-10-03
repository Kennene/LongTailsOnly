# ADR 0011: Scenariusze demonstracyjne jako wykonywalne dane (`shared/scenarios`)

**Status:** Proponowany (do akceptacji zespołu) · **Autor:** Sydor (Osoba 6) · **Data:** 2026-10-03
**Doprecyzowuje:** `PRODUKT.md` UC-1…UC-5, krok 6.2 planu zespołowego

## Kontekst

Pięć przypadków użycia z `PRODUKT.md` jest potrzebnych w czterech miejscach: generator historii aktywności Osoby 2 (2.6), testy end-to-end Osoby 6 (6.3), widoki frontendu (5.7–5.8) oraz skrypt prezentacji (6.6). Jeśli każdy konsument opisze je po swojemu, powstają cztery rozjeżdżające się prawdy — scenariusz zmieniony w jednym miejscu nie zmieni się w pozostałych.

Dodatkowo scenariusze muszą być deterministyczne. Seed (ADR 0008) liczy daty względem `anchor`, więc „wygasa za 3 dni" jest prawdziwe zawsze po seedzie. Scenariusze muszą działać na tej samej zasadzie — bez odwołań do zegara systemowego, inaczej ten sam test przechodzi dziś i pada za miesiąc.

## Decyzja

1. **Jedno źródło prawdy: `shared/scenarios/*.json`** — po jednym pliku na przypadek użycia (`uc-01-onboarding.json` … `uc-05-last-admin.json`).

2. **Kroki `when` są deklaratywne i zamknięte:**
   - `{"type": "reset"}` — `POST /api/v1/demo/reset` (ADR 0008),
   - `{"type": "time_travel", "days": <int>}` — `POST /api/v1/simulation/time-travel`,
   - `{"type": "api", "method": ..., "path": ..., "as": ...}` — wywołanie i zapamiętanie odpowiedzi pod aliasem.
   - Nieznany typ kroku powoduje `ValueError` z jego nazwą, nie ciche pominięcie.

3. **Oczekiwania odnoszą się do pól kontraktu** z ADR 0009, w `snake_case`:
   `status` (`ACTIVE`/`WARNING`/`EXPIRED`), `days_remaining`, `recommendation` (`KEEP`/`DOWNSCOPE`/`REVOKE`), `current_role` (`read`/`write`/`admin`).
   Test pilnuje, że każdy klucz w `then[].expect` istnieje w modelu z `CONTRACT_RESPONSE_MODELS`.

4. **Aktywność używa nazw zdarzeń z `app/domain/enums.py`** — `PushEvent`, `PullRequestReviewEvent`, `IssueCommentEvent` — oraz `required_permission` ∈ `{write, read}`. Wartość `admin` jest niedozwolona w danych scenariusza.

5. **Nie ma osobnego pliku schematu scenariusza.** Kształt jest zapisany w `shared/scenarios/README.md`, a egzekwowany przez testy w `backend/tests/scenarios/`. Jeden plik schematu i testy sprawdzające to samo byłyby dwoma źródłami prawdy.

6. **Podział odpowiedzialności:**
   - Generator Osoby 2 (2.6) czyta wyłącznie `given`,
   - runner Osoby 6 (6.3) wykonuje `when` i weryfikuje `then`,
   - scenariusze **zastępują** doradcze przypadki A–D z Zadań 4 i 19 ogólnego planu implementacji; nie są utrzymywane równolegle.

7. **Rozmiary skoku czasu są parametrem wywołania, nie kontraktem.** `TimeTravelRequest.days` przyjmuje 1–365, więc presety `+15/+30/+60` używane przez scenariusze i pasek czasu to wybór UI, a nie ograniczenie API. Rozbieżność między `PLAN.md` (+25/+35) a `PRODUKT.md` (+15/+30/+60) dotyczy więc wyłącznie przycisków w panelu — przyjęto `+15/+30/+60`.

## Konsekwencje

- **Zalety**: scenariusz edytuje się raz, a zmiana trafia jednocześnie do generatora, testów i prezentacji; testy są deterministyczne i parametryzowane plikami; zero nowych zależności.
- **Ryzyko**: brak schematu oznacza, że błędnie zapisany scenariusz zostanie wykryty dopiero przez test. Kompensuje to czytelny błąd runnera przy nieznanym kroku.
- **Odrzucone**: osobne definicje scenariuszy u każdego konsumenta (rozjazd), plik JSON Schema dla scenariuszy (drugie źródło prawdy wobec testów), scenariusze odwołujące się do zegara systemowego (testy niestabilne).
