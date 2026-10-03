# Zadanie 2: Konfiguracja aplikacji i zegar symulowany — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecany) lub `superpowers:executing-plans`. Kroki używają checkboxów (`- [ ]`).

**Cel:** `Settings` z parametrami polityki oraz `TimeProvider` (adapter `ClockPort`) z przesuwaniem i resetem offsetu.

**Architektura:** `TimeProvider` to jedyne miejsce w `app/`, które może wywołać `datetime.now()`. Czas bazowy jest wstrzykiwalny (`source`), dzięki czemu testy są deterministyczne. Offset trzymany jest w pamięci procesu (ADR 0003).

**Stack:** Python 3.14 stdlib (`dataclasses`, `datetime`, `functools`).

**Spec:** ADR 0003; ADR 0006 §3, §6; plan główny — Zadanie 2.

**Branch:** `feat/task-02-config-and-clock` · **Zależności:** 1 · **Odblokowuje:** 8 (serwis), 10 (serwis), 11

## Ograniczenia globalne

- `get_current_time()` zawsze zwraca `datetime` ze strefą UTC.
- Brak nowych zależności (bez `pydantic-settings`).

## Review Focus

- **Ujemny skok w czasie:** `advance(-7)` jest dozwolony (cofnięcie demo), ale `reset()` zawsze wraca do offsetu 0 → test `test_advance_accepts_negative_days_and_reset_clears_offset`.
- **Kumulacja skoków:** `+7`, a potem `+25` daje offset 32 → test `test_advances_accumulate`.
- **Strefa czasowa domyślnego źródła:** domyślne źródło musi być aware UTC → test `test_default_source_is_utc_aware`.
- **Zegar biegnie dalej:** offset dodawany jest do bieżącego `source()`, a nie do zamrożonego punktu (demo trwa kilka minut).
- **Singleton procesu:** konfiguracja tworzona raz (`get_settings()` z cache) → test `test_get_settings_is_cached`.

---

### Krok 1: `Settings`

**Pliki:**
- Utwórz: `backend/app/core/__init__.py`, `backend/app/core/config.py`, `backend/tests/core/__init__.py`
- Test: `backend/tests/core/test_config.py`

**Interfejsy:**
- Produkuje: `Settings` (frozen dataclass) z polami `database_url`, `org`, `admin_login`, `lease_days`, `warning_days`, `github_api_base_url`; `get_settings() -> Settings`.

- [ ] **1.1: Napisz testy** `backend/tests/core/test_config.py`:

```python
from app.core.config import Settings, get_settings


def test_settings_defaults_match_adr() -> None:
    settings = Settings()

    assert settings.lease_days == 30
    assert settings.warning_days == 7
    assert settings.org == "longtails"
    assert settings.admin_login == "tomasz-admin"
    assert settings.database_url.startswith("sqlite+aiosqlite:///")


def test_get_settings_is_cached() -> None:
    assert get_settings() is get_settings()
```

- [ ] **1.2: Uruchom — RED.** Z `backend/`: `pytest tests/core/test_config.py -q` → `ModuleNotFoundError`.

- [ ] **1.3: Dodaj `backend/app/core/config.py`** (oraz puste `app/core/__init__.py`, `tests/core/__init__.py`):

```python
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite+aiosqlite:///./lease_governor.db"
    org: str = "longtails"
    admin_login: str = "tomasz-admin"
    lease_days: int = 30
    warning_days: int = 7
    github_api_base_url: str = "http://localhost:8000/api/v3"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **1.4: Uruchom — GREEN.** `pytest tests/core/test_config.py -q` → `2 passed`.

- [ ] **1.5: Commit.** `git add backend/app/core backend/tests/core && git commit -m "feat(core): add application settings"`

---

### Krok 2: `TimeProvider`

**Pliki:**
- Utwórz: `backend/app/core/time_provider.py`
- Test: `backend/tests/core/test_time_provider.py`

**Interfejsy:**
- Konsumuje: `ClockPort` (Zadanie 1, strukturalnie).
- Produkuje: `TimeProvider(source: Callable[[], datetime] | None = None)`, `.get_current_time() -> datetime`, `.advance(days: int) -> datetime`, `.reset() -> datetime`, `.offset_days: int`.

- [ ] **2.1: Napisz testy** `backend/tests/core/test_time_provider.py`:

```python
from datetime import UTC, datetime, timedelta

from app.core.time_provider import TimeProvider
from app.ports.clock import ClockPort

BASE = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def fixed_source() -> datetime:
    return BASE


def test_current_time_uses_utc_and_offset() -> None:
    clock = TimeProvider(source=fixed_source)

    assert clock.get_current_time() == BASE
    assert clock.offset_days == 0


def test_advance_moves_clock_by_requested_days() -> None:
    clock = TimeProvider(source=fixed_source)

    moved = clock.advance(7)

    assert moved == BASE + timedelta(days=7)
    assert clock.get_current_time() == BASE + timedelta(days=7)
    assert clock.offset_days == 7


def test_advances_accumulate() -> None:
    clock = TimeProvider(source=fixed_source)

    clock.advance(7)
    clock.advance(25)

    assert clock.offset_days == 32


def test_advance_accepts_negative_days_and_reset_clears_offset() -> None:
    clock = TimeProvider(source=fixed_source)

    clock.advance(-3)
    assert clock.get_current_time() == BASE - timedelta(days=3)

    assert clock.reset() == BASE
    assert clock.offset_days == 0


def test_default_source_is_utc_aware() -> None:
    clock: ClockPort = TimeProvider()

    assert clock.get_current_time().tzinfo is UTC
```

- [ ] **2.2: Uruchom — RED.** `pytest tests/core/test_time_provider.py -q` → `ModuleNotFoundError`.

- [ ] **2.3: Dodaj `backend/app/core/time_provider.py`:**

```python
"""Adapter zegara symulowanego (ADR 0003). Jedyne dozwolone użycie `datetime.now()` w `app/`."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta


def _system_utc_now() -> datetime:
    return datetime.now(UTC)


class TimeProvider:
    def __init__(self, source: Callable[[], datetime] | None = None) -> None:
        self._source = source or _system_utc_now
        self._offset_days = 0

    @property
    def offset_days(self) -> int:
        return self._offset_days

    def get_current_time(self) -> datetime:
        return self._source() + timedelta(days=self._offset_days)

    def advance(self, days: int) -> datetime:
        self._offset_days += days
        return self.get_current_time()

    def reset(self) -> datetime:
        self._offset_days = 0
        return self.get_current_time()
```

- [ ] **2.4: Uruchom — GREEN.** `pytest tests/core/test_time_provider.py -q` → `5 passed`.

- [ ] **2.5: Commit.** `git add backend/app/core/time_provider.py backend/tests/core/test_time_provider.py && git commit -m "feat(core): add simulated TimeProvider clock"`

---

### Krok 3: Weryfikacja

- [ ] **3.1:** Z `backend/`: `pytest -q && ruff check . && ruff format --check .` → zielone.
- [ ] **3.2:** `grep -rnE "datetime\.(now|utcnow)" app/ | grep -v core/time_provider.py` → brak wyników.
- [ ] **3.3:** PR `feat/task-02-config-and-clock` → `main`.
