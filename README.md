# LongTailsOnly — GitHub Access Lease Governor

Projekt na hackathon **Hack Yeah 2026** (kategoria Defence + nagroda Prelint).

**Żaden dostęp nie jest wieczny.** Panel administratora bezpieczeństwa IT, w którym uprawnienia do repozytoriów GitHuba są dzierżawą: wygasają, chyba że realna aktywność albo decyzja admina je odnowi. Opis produktu: [`PRODUKT.md`](PRODUKT.md), słownik: [`GLOSSARY.md`](GLOSSARY.md).

## Zespół i podział pracy

| Osoba | Zakres | Kto |
| --- | --- | --- |
| 1 | Fundament backendu: szkielet, schematy + kontrakt TS, modele, zegar, seed, reset demo | Kocik |
| 2 | Mock GitHuba i aktywność, time-travel | Dawid |
| 3 | Silnik dzierżawy: statusy, odnawianie, deeskalacja, ostatni admin, tryby, decyzje | Guziol — [`docs/3-silnik-dzierzawy/DOCUMENTATION.md`](docs/3-silnik-dzierzawy/DOCUMENTATION.md) |
| 4 | Standard zespołu, onboarding, odwołania, audyt, dane dla dashboardu i grafu | Durczkos — [`docs/osoba-4.md`](docs/osoba-4.md) |
| 5 | Frontend (React + React Flow) | Kubuś |
| 6 | Scenariusze, testy E2E, Prelint, slajdy, zgłoszenie | Sydor |

## Stan prac (2026-10-03)

| Osoba | Stan |
| --- | --- |
| 1 | ✅ Kroki 1.1–1.6 w `main` (PR #5) |
| 2 | ✅ Mock GitHuba, aktywność i time-travel w `main` (PR #4, ADR 0010) |
| 3 | ✅ 3.1–3.6 na gałęzi `guziol/silnik-dzierzawy` (3.4 osobno: `guziol/ochrona-ostatniego-admina`), jeszcze nie w `main`. Odblokowuje 4.3C i 4.6B. Szczegóły: [`docs/3-silnik-dzierzawy/DOCUMENTATION.md`](docs/3-silnik-dzierzawy/DOCUMENTATION.md) |
| 4 | ✅ 4.1, 4.2, 4.3 (złożenie i odrzucenie), 4.4, 4.5, 4.6 (logika i typy), zegar symulacji, poprawki po audycie kodu; ⏳ 4.3C i 4.6B czekają na Osobę 3. Szczegóły: [`docs/osoba-4.md`](docs/osoba-4.md) |
| 5, 6 | ⏳ Nie zaczęte w repo |

Który dzień demo pokazuje panel: `GET /api/v1/simulation/clock` → `{"simulated_now": "2026-10-18T15:24:00Z", "offset_days": 15}`.

## Uruchomienie

Backend (Python 3.14, FastAPI): instrukcja w [`backend/README.md`](backend/README.md).

```bash
cd backend
uv sync --extra dev
uv run uvicorn app.main:app --reload   # http://localhost:8000/docs
uv run pytest
```

Przy pierwszym starcie serwer sam buduje bazę i wgrywa dane demo (19 osób, 10 repo, persony Kamil i Marta). Reset demo: `POST /api/v1/demo/reset`.

## Struktura repo

```
backend/            FastAPI + SQLAlchemy + Alembic (app/, tests/, contract/schema.json)
frontend/src/types/ typy TS generowane z kontraktu backendu (ADR 0009) — nie edytować ręcznie
docs/adr/           decyzje architektoniczne (ADR 0001–0011)
docs/superpowers/   plany zadań (plans/) i specyfikacje (specs/)
docs/osoba-4.md     stan i kontrakty Osoby 4
```

## Jak pracujemy

- Metodologia i zasady dla agentów: [`AGENTS.md`](AGENTS.md), standardy kodu: [`CODING_STANDARDS.md`](CODING_STANDARDS.md).
- Decyzje zapisujemy w ADR-ach. Kontrakt API (Pydantic → TypeScript) opisuje ADR 0009, a kontrakty Osoby 4 — ADR 0011.
- Jedno zadanie = jedna gałąź = jeden PR do `main`.
