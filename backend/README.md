# Backend (FastAPI)

Wymagania: **Python 3.14** i [uv](https://docs.astral.sh/uv/).

```bash
cd backend
uv sync --extra dev                       # instaluje zależności (z narzędziami do testów)
uv run uvicorn app.main:app --reload      # serwer na http://localhost:8000
uv run pytest                             # testy
```

Bez `uv` (Python 3.14 w aktywnym venv):

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload
pytest
```

- `GET /health` → `{"status": "ok", "database": "ok"}` (sprawdza też połączenie z bazą)
- Dokumentacja API: http://localhost:8000/docs
- Przy pierwszym starcie serwer sam tworzy bazę (migracje) i wgrywa dane demo (19 osób, 10 repo, persony Kamil i Marta).
- `POST /api/v1/demo/reset` → przywraca bazę i zegar do stanu startowego demo (wyłączenie: `ENABLE_DEMO_RESET=false`).
- Mock GitHuba (`/api/v3/...`), zdarzenia aktywności i `/api/v1/simulation/time-travel`: patrz `docs/github-mock.md` (ADR 0010).
- Mock Jiry (`/rest/api/3/...`): patrz `docs/jira-mock.md` (ADR 0016).
- Baza: SQLite przez aiosqlite, adres w `DATABASE_URL` (patrz `.env.example`).
- Nowa biblioteka: `uv add nazwa` (narzędzie tylko do developmentu: `uv add --optional dev nazwa`).

> Jeśli `uv` ostrzega `VIRTUAL_ENV ... does not match the project environment`, masz aktywne inne venv (np. z katalogu głównego repo) — zrób `deactivate` albo je zignoruj: `uv run` i tak użyje `backend/.venv`.

## Kontrakt API (typy dla frontendu)

Źródłem prawdy są schematy Pydantic w `app/schemas/` i enumy w `app/domain/enums.py` (ADR 0009).
Po **każdej** ich zmianie wygeneruj kontrakt i typy TypeScript:

```bash
cd backend
uv run python scripts/export_contract.py
npx --yes json-schema-to-typescript@15 -i contract/schema.json -o ../frontend/src/types/api.ts --unreachableDefinitions --additionalProperties=false --bannerComment "/* AUTO-GENERATED from backend/contract/schema.json - do not edit. Regenerate: see backend/README.md */"
```

`frontend/src/types/api.ts` nie edytujemy ręcznie. Test `tests/schemas/test_contract_is_fresh.py` pada, jeśli `contract/schema.json` jest nieaktualny.

## Migracje bazy (Alembic)

Schemat bazy powstaje **wyłącznie z migracji** w `alembic/versions/` (ADR 0007, pkt 9) — serwer i testy uruchamiają je same.

Po **każdej** zmianie w `app/models/`:

```bash
cd backend
uv run alembic revision --autogenerate -m "opis zmiany"   # nowy plik w alembic/versions/
# przejrzyj wygenerowany plik ręcznie!
uv run pytest tests/db/test_migrations.py                 # sprawdza, czy migracje = modele
```

Przydatne: `uv run alembic upgrade head` (zastosuj), `uv run alembic current` (aktualna wersja), `uv run alembic downgrade -1` (cofnij jedną).

## API v1 (stan 2026-10-03)

Wszystkie endpointy domenowe są pod `/api/v1` (router `app/api/v1/router.py`; nowy router = jedna linia `include_router`). Błędy: kod HTTP + `{"detail": "..."}` (`ServiceError` w `app/services/errors.py`). Szczegóły kontraktu: ADR 0014, opis kroków Osoby 4: [`docs/osoba-4.md`](../docs/osoba-4.md).

| Endpoint | Co zwraca |
| --- | --- |
| `GET /api/v1/simulation/clock` | który dzień demo: `{"simulated_now", "offset_days"}` |
| `GET /api/v1/teams/{slug}/baseline` | standard zespołu (`dev`, `qa`) |
| `GET /api/v1/onboarding/{login}` · `POST …/apply` | propozycja dostępu dla nowej osoby i zatwierdzenie jednym kliknięciem |
| `POST /api/v1/appeals` · `POST /api/v1/appeals/{id}/reject` | złożenie odwołania (wymagane nowe uzasadnienie) i odrzucenie |
| `GET /api/v1/appeals?login=&lease_id=&status=` | historia odwołań z gotowymi liczbami |
| `GET /api/v1/audit?actor_type=&action=&actor_login=&target=&since=&until=&limit=` | dziennik audytu (tylko do dopisywania) |
| `POST /api/v1/appeals/{id}/decision` | decyzja na odwołaniu (przedłuż / zdeeskaluj / odbierz) silnikiem dzierżaw |
| `GET /api/v1/dashboard/stats` | gotowe liczniki KPI dashboardu |
| `GET /api/v1/graph?team=` | graf uprawnień w formacie React Flow (węzły z pozycjami, krawędzie ze statusem) |
| `POST /api/v1/demo/reset` | reset bazy i zegara do stanu demo |

Audyt zapisuje się **wyłącznie** przez `write_audit_event` (`app/services/audit_service.py`); migracja `0002` blokuje w bazie `UPDATE`/`DELETE` na `audit_logs`. Wspólne fabryki testowe: `tests/factories.py`.

Bez `uv` (np. brak instalacji): `python3.14 -m venv .venv && .venv/bin/pip install -e ".[dev]"`, testy `.venv/bin/python -m pytest`, kontrakt `PYTHONPATH=. .venv/bin/python scripts/export_contract.py`.
