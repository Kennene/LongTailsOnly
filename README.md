# TailCut — GitHub Access Lease Governor

> **Żaden dostęp nie jest wieczny.**
> Panel dla zespołów bezpieczeństwa IT, w którym uprawnienia do repozytoriów są dostępem czasowym: wygasają, chyba że odnowi je dowód rzeczywistego użycia albo świadoma decyzja administratora.

Projekt z obszaru cyberbezpieczeństwa (Identity & Access Management, Privileged Access Management), zbudowany na zasadach **Zero Standing Privileges** i **Least Privilege**. Powstał na hackathon Hack Yeah 2026 (kategoria Defence oraz nagroda Prelint).

---

## Problem

W większości organizacji uprawnienia w systemach kontroli wersji nadaje się „na wszelki wypadek" i nigdy nie odbiera.

- **Pełzanie uprawnień (privilege creep).** Programista zmienia projekt, ale zachowuje `write` lub `admin` w dziesiątkach repozytoriów, których już nie dotyka.
- **Duża powierzchnia ataku.** Przejęcie jednego konta ze zbędnym, bezterminowym dostępem pozwala zatruć łańcuch dostaw (supply chain), wstrzyknąć złośliwy kod, wykraść sekrety lub wyłączyć ochronę gałęzi.
- **Brak rozliczalności.** Nikt nie wie, które uprawnienia są naprawdę używane, a okresowe przeglądy dostępów są powierzchowne i pracochłonne.
- **Strach przed odebraniem dostępu.** Administrator woli niczego nie ruszać, bo błędna decyzja może zablokować nocny deployment.

## Rozwiązanie

**Access Lease Governor** zamienia stałe uprawnienia w **dostępy czasowe (leases)**, a o ich odnowieniu decydują dane, nie przyzwyczajenie.

1. Każdy dostęp `write` lub `read` ma datę ważności (domyślnie **30 dni**, konfigurowalna).
2. **Dostęp odnawia się sam, ale tylko dowodem użycia na odpowiednim poziomie.** `PushEvent` odnawia `write` i `read`. Recenzowanie PR-ów i komentarze odnawiają wyłącznie `read`.
3. System **wykrywa nadmiar uprawnień.** Kto ma `write`, a od 30 dni tylko recenzuje kod, dostaje rekomendację obniżenia do `read`, a nie całkowitego odebrania.
4. **7 dni przed wygaśnięciem** pojawia się ostrzeżenie. Użytkownik może złożyć odwołanie z unikalnym uzasadnieniem biznesowym.
5. **Człowiek decyduje, z pełnym kontekstem.** Administrator widzi statystyki użycia, historię odwołań i treść wniosku, a potem przedłuża (mnożnik, preset lub data), obniża albo odbiera dostęp.
6. **Każda operacja trafia do niezmiennego dziennika audytowego**: kto, co, kiedy, dlaczego, człowiek czy automat.

### Cykl życia dostępu

```
              dowód użycia (push / review / komentarz)
        ┌───────────────────────────────────────────────┐
        ▼                                               │
   ┌─────────┐   ≤ 7 dni do końca   ┌─────────┐   brak decyzji   ┌─────────┐
   │ ACTIVE  │ ───────────────────▶ │ WARNING │ ───────────────▶ │ EXPIRED │
   └─────────┘                      └────┬────┘                  └────┬────┘
                                         │ odwołanie + decyzja admina │
                                         ▼                            ▼
                              przedłuż │ obniż do read │ odbierz (REVOKED)
```

Rola `admin` jest **stała** (break-glass) i nie podlega wygasaniu. Chroni ją reguła Last Admin Protection.

### Co odnawia dostęp

| Zdarzenie (GitHub Events API) | Poziom dowodu | Odnawia |
| --- | --- | --- |
| `PushEvent` | `write` | `write` i `read` |
| `PullRequestReviewEvent` | `read` | tylko `read` |
| `IssueCommentEvent` | `read` | tylko `read` |

Zdarzenia administracyjne i pasywne czytanie kodu (`git clone`, przeglądanie w przeglądarce) nie odnawiają niczego. GitHub nie udostępnia takiej telemetrii w publicznym strumieniu zdarzeń.

### Rekomendacje silnika

Silnik doradza wyłącznie dla dostępów wygasających (`WARNING`, `EXPIRED`).

| Sytuacja | Rekomendacja |
| --- | --- |
| Aktywność wystarczająca dla obecnej roli | `KEEP` |
| Aktywność tylko na niższym poziomie (np. review zamiast pushy) | `DOWNSCOPE` |
| Brak jakiejkolwiek aktywności w oknie dostępu | `REVOKE` |

Rekomendacje są w pełni deterministyczne i oparte na regułach. Można je prześledzić do konkretnych zdarzeń.

---

## Funkcje panelu

| Widok | Do czego służy |
| --- | --- |
| **Dashboard** | Liczniki dostępów (aktywne, ostrzeżenia, wygasłe, stałe), liczba rekomendacji deeskalacji, oczekujące odwołania, kandydaci do onboardingu, pasek zegara symulacji. |
| **Dostępy** | Inwentarz: osoba, zespół, repozytorium, rola, ostatnia aktywność, dni do końca, status i rekomendacja. Modal decyzji z dowodem użycia (pushe, review, komentarze) i elastycznym przedłużaniem. |
| **Odwołania** | Wnioski użytkowników z uzasadnieniem, historia odwołań i decyzja administratora. |
| **Standard zespołu** | Zestaw repozytoriów, w których aktywnie pracuje co najmniej 50% zespołu, i onboarding nowej osoby jednym zatwierdzeniem. `admin` nigdy nie jest proponowany automatycznie. |
| **Graf uprawnień** | Interaktywna mapa zespół ↔ osoba ↔ repozytorium z kolorami statusów i wyróżnionymi dostępami do obniżenia lub odebrania. |
| **Audyt** | Oś czasu operacji z filtrem decyzji człowieka i reguł automatycznych. Wpisy są dopisywane, nigdy zmieniane. |
| **Mocki** | Podgląd symulatorów GitHuba i Jiry oraz sterowanie czasem (Time Travel). |

### Przedłużanie dostępu

Administrator wybiera jedną z czterech form: **mnożnik** dotychczasowego okresu (1,5× lub 2×), **preset** (+7, +14, +30, +90 dni), **własną liczbę dni** albo **dokładną datę**. Obniżenie i odebranie dostępu wymagają uzasadnienia.

### Tryby egzekwowania

| Tryb | Zachowanie |
| --- | --- |
| `disabled` | Tylko statusy i audyt, bez rekomendacji i bez akcji. |
| `warning` (domyślny) | Rekomendacje i ostrzeżenia, decyduje administrator. |
| `auto` | Wygasłe dostępy są automatycznie obniżane lub odbierane, z zachowaniem Last Admin Protection. |

---

## Zasady, na których opiera się system

- **Dowód zamiast kalendarza.** Dostęp odnawia użycie, nie upływ czasu ani kliknięcie „przedłuż".
- **Najniższy wystarczający poziom.** Zamiast odcinać, system obniża dostęp do tego, co faktycznie jest używane.
- **Celowe tarcie.** Każde odwołanie wymaga nowego uzasadnienia. Szablonowe, automatyczne odnowienia nie istnieją.
- **Last Admin Protection.** Ani automat, ani administrator nie odbierze roli `admin`, jeśli w repozytorium lub organizacji nie zostałby żaden administrator (odpowiedź 403, a próba trafia do audytu).
- **Pełna rozliczalność.** Dziennik audytowy jest niezmienny i rozróżnia decyzje człowieka od reguł automatycznych.
- **Determinizm.** Te same dane dają te same decyzje, więc działanie systemu można zweryfikować i odtworzyć.

---

## Demo: sterowanie czasem

Panel ma symulowany zegar, który pozwala w minutę pokazać to, co normalnie trwa miesiące.

| Scenariusz | Co pokazuje |
| --- | --- |
| **UC-1** Onboarding | Nowa osoba w zespole DEV dostaje standard zespołu jednym zatwierdzeniem. |
| **UC-2** Deeskalacja | Deweloper z `write` od 25 dni tylko recenzuje kod, więc system proponuje `read`. |
| **UC-3** Odwołanie | Ostrzeżenie, uzasadnienie użytkownika, decyzja administratora (np. przedłużenie 2×). |
| **UC-4** Time Travel | Skok o +15, +25 i +35 dni: aktywny → ostrzeżenie → wygasły. |
| **UC-5** Ostatni admin | Próba odebrania ostatniego administratora zostaje zablokowana. |

Scenariusze są opisane jako dane w [`shared/scenarios/`](shared/scenarios/) i uruchamiane jako testy integracyjne.

---

## Architektura

Aplikacja jest SPA z wydzielonym silnikiem reguł, ułożonym w **architekturze portów i adapterów**. Rdzeń nie zna dostawcy, więc GitLab, Bitbucket czy chmurowe IAM można podpiąć bez zmian w logice.

```
┌───────────────────────┐      REST /api/v1      ┌────────────────────────────────────┐
│  Panel (React SPA)    │ ◀────────────────────▶ │  FastAPI                           │
│  Dashboard · Graf ·   │   typy TS generowane   │  ┌──────────────────────────────┐  │
│  Audyt · Decyzje      │   z kontraktu API      │  │ Domena: czyste reguły        │  │
└───────────────────────┘                        │  │ (statusy, odnawianie,        │  │
                                                 │  │  rekomendacje, baseline)     │  │
                                                 │  └──────────────┬───────────────┘  │
                                                 │ Serwisy · Last Admin Guard · Audyt │
                                                 │  ┌──────────────┴───────────────┐  │
                                                 │  │ Porty: VCSProvider · Zegar   │  │
                                                 │  └──────────────┬───────────────┘  │
                                                 └─────────────────┼──────────────────┘
                                                    ┌──────────────┴──────────────┐
                                                    │ Adaptery: mock GitHuba,     │
                                                    │ mock Jiry, zegar symulacji  │
                                                    └─────────────────────────────┘
```

- **Domena** (`backend/app/domain/`): czyste funkcje bez I/O, w pełni testowalne jednostkowo.
- **Dostawcy:** mock GitHuba odwzorowuje REST API v3 (collaborators, events), a mock Jiry (role projektowe, JQL) jest drugim dostawcą, który potwierdza niezależność rdzenia (ADR 0016).
- **Zegar** jest portem. Silnik nigdy nie czyta czasu systemowego, więc Time Travel jest deterministyczny.
- **Kontrakt API:** modele Pydantic są źródłem prawdy, a typy TypeScript są z nich generowane (ADR 0009), więc rozjazd frontendu z backendem jest błędem kompilacji.

### Stack

| Warstwa | Technologie |
| --- | --- |
| Backend | Python 3.14, FastAPI, SQLAlchemy 2 (async), SQLite, Alembic, Pydantic v2 |
| Frontend | React 19 + React Compiler, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query, `@xyflow/react` |
| Testy | pytest, Vitest, React Testing Library, MSW |

---

## Szybki start

Wymagania: [`uv`](https://docs.astral.sh/uv/), Node.js 20.19+ lub 22.12+, `curl`. Backend wymaga Pythona 3.14, który `uv` pobierze automatycznie.

```bash
./run.sh --reset      # backend + panel; reset danych demo
```

- Panel: <http://localhost:5173>
- Dokumentacja API (Swagger): <http://localhost:8000/docs>
- Dokumentacja mocków: GitHub <http://localhost:8000/mocks/github/docs>, Jira <http://localhost:8000/mocks/jira/docs>

Inne warianty:

```bash
./run.sh --fixtures   # sam panel na statycznych danych, bez backendu
./build.sh --test     # testy backendu i scenariuszy, lint i testy frontendu, build produkcyjny
```

`run.sh` przy każdym starcie dociąga zależności: synchronizuje backend (`uv sync`), a `npm ci` uruchamia, gdy zmienił się `frontend/package-lock.json` — po pullu z nową paczką nie trzeba ręcznie odpalać `./build.sh`.

Przy pierwszym starcie backend sam buduje bazę i wgrywa dane demo: jedną organizację, 19 osób (zespoły DEV i QA), 10 repozytoriów oraz persony Kamila (senior developer) i Marty (QA). Reset w trakcie działania: `POST /api/v1/demo/reset`.

Szczegóły uruchamiania i testów: [`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md).

---

## Struktura repozytorium

```
backend/            FastAPI: app/ (domain, services, ports, adapters, api), tests/, contract/schema.json
frontend/           React SPA: src/ (pages, components, hooks, api), DESIGN.md
shared/             fixture'y (fixtures/) i scenariusze demo (scenarios/)
docs/adr/           decyzje architektoniczne (ADR 0001–0016)
PRODUKT.md          pełny opis produktu, persony, przypadki użycia
GLOSSARY.md         słownik pojęć
```

---

## Ograniczenia i kierunki rozwoju

**Świadome ograniczenia obecnej wersji**

- Dostawcy są symulowani (mock GitHuba i Jiry). Logika działa na kontrakcie zgodnym z prawdziwym API.
- Pasywne czytanie kodu (`clone`, `fetch`, przeglądanie WWW) nie jest widoczne w telemetrii GitHuba, więc nie liczy się jako aktywność.
- Wygasaniu podlegają poziomy `write` i `read`. Rola `admin` jest stała.
- Panel nie ma logowania. Działa jako konto administratora.

**Dalszy rozwój**

- Podłączenie prawdziwych webhooków i Audit Log API GitHuba zamiast mocka.
- Adaptery GitLab, Bitbucket i chmurowego IAM przez ten sam port dostawcy.
- Kolejne poziomy uprawnień (`triage`, `release`, Fine-Grained PAT).
- SSO i role w panelu, powiadomienia (Slack, e-mail) przed wygaśnięciem dostępu.
- Wyjaśnienia rekomendacji w języku naturalnym dla menedżerów.

---

## Dokumentacja

- [`PRODUKT.md`](PRODUKT.md): wizja, problem, persony, przypadki użycia, zakres
- [`GLOSSARY.md`](GLOSSARY.md): pojęcia domenowe i techniczne
- [`docs/adr/`](docs/adr/README.md): decyzje architektoniczne wraz z uzasadnieniem
- [`frontend/DESIGN.md`](frontend/DESIGN.md): język projektowy panelu
- [`AGENTS.md`](AGENTS.md) i [`CODING_STANDARDS.md`](CODING_STANDARDS.md): zasady pracy i standardy kodu
