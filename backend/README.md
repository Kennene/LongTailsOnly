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
- Baza: SQLite przez aiosqlite, adres w `DATABASE_URL` (patrz `.env.example`).
- Nowa biblioteka: `uv add nazwa` (narzędzie tylko do developmentu: `uv add --optional dev nazwa`).

> Jeśli `uv` ostrzega `VIRTUAL_ENV ... does not match the project environment`, masz aktywne inne venv (np. z katalogu głównego repo) — zrób `deactivate` albo je zignoruj: `uv run` i tak użyje `backend/.venv`.
