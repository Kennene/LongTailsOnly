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
- Mock Jiry (`/rest/api/3/...`): patrz `docs/jira-mock.md` (ADR 0011).
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
