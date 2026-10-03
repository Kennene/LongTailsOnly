# Zadanie 3: Modele ORM i inicjalizacja bazy — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecany) lub `superpowers:executing-plans`. Kroki używają checkboxów (`- [ ]`).

**Cel:** Modele SQLAlchemy 2.0 z ADR 0006 §5, async SQLite, `init_db`, typ `UTCDateTime` oraz współdzielone fixture'y i fabryki testowe.

**Architektura:** `Base` (DeclarativeBase) w `app/db/base.py`. Enumy zapisywane jako ich wartości (`"write"`), a daty zawsze aware UTC. Silnik i fabryka sesji są tworzone funkcjami, bez globalnego stanu — aplikację podłącza Zadanie 6/11. Relacje używają `lazy="selectin"`, bo leniwe ładowanie w async kończy się `MissingGreenlet`.

**Stack:** SQLAlchemy 2.0 (`Mapped`, `mapped_column`), aiosqlite.

**Spec:** ADR 0006 §5, §8; ADR 0002; plan główny — Zadanie 3.

**Branch:** `feat/task-03-orm-models` · **Zależności:** 1 · **Odblokowuje:** 4 (część DB), 6, 7, 8–11 (serwisy)

## Ograniczenia globalne

- Pola i typy dokładnie jak w ADR 0006 §5 — korzystają z nich Zadania 4–11.
- `Lease` **nie** ma `last_activity_at` ani `last_activity_type`.
- Każdy plik ≤ 300 linii.

## Review Focus

- **Naiwne daty z SQLite:** odczyt musi zwracać `tzinfo=UTC` → test `test_utc_datetime_roundtrip_is_aware`.
- **Zapis naiwnej daty:** to błąd programisty, więc `ValueError` zamiast cichego założenia strefy → test `test_naive_datetime_is_rejected`.
- **Enum w bazie jako wartość:** w kolumnie ma być `"write"`, a nie `"WRITE"` (seed i raw SQL) → test `test_enums_are_stored_as_values`.
- **Duplikat dzierżawy:** druga dzierżawa dla pary `(user, repo)` → `IntegrityError` → test `test_lease_pair_is_unique`.
- **In-memory SQLite i wiele sesji:** bez `StaticPool` każde połączenie widzi pustą bazę (testy API w Zadaniu 6) → test `test_memory_engine_shares_schema_between_sessions`.

---

### Krok 1: `Base`, `UTCDateTime`, `str_enum`

**Pliki:**
- Utwórz: `backend/app/db/__init__.py`, `backend/app/db/base.py`, `backend/app/db/types.py`, `backend/tests/db/__init__.py`
- Test: `backend/tests/db/test_types.py`

**Interfejsy:**
- Produkuje: `Base`, `UTCDateTime`, `str_enum(enum_cls) -> sqlalchemy.Enum`.

- [ ] **1.1: Napisz testy** `backend/tests/db/test_types.py`:

```python
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import Column, Integer, MetaData, Table, insert, select
from sqlalchemy.exc import StatementError
from sqlalchemy.ext.asyncio import create_async_engine

from app.db.types import UTCDateTime

pytestmark = pytest.mark.anyio

metadata = MetaData()
stamps = Table("stamps", metadata, Column("id", Integer, primary_key=True), Column("at", UTCDateTime()))


async def roundtrip(value: datetime) -> datetime:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(metadata.create_all)
        await connection.execute(insert(stamps).values(id=1, at=value))
        stored = await connection.scalar(select(stamps.c.at))
    await engine.dispose()
    return stored


async def test_utc_datetime_roundtrip_is_aware() -> None:
    warsaw = timezone(timedelta(hours=2))

    stored = await roundtrip(datetime(2026, 10, 3, 14, 0, tzinfo=warsaw))

    assert stored == datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
    assert stored.tzinfo is UTC


async def test_naive_datetime_is_rejected() -> None:
    with pytest.raises(StatementError):
        await roundtrip(datetime(2026, 10, 3, 12, 0))
```

- [ ] **1.2: Uruchom — RED.** Z `backend/`: `pytest tests/db/test_types.py -q` → `ModuleNotFoundError`.

- [ ] **1.3: Zaimplementuj.**

`backend/app/db/base.py`:

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

`backend/app/db/types.py`:

```python
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import DateTime, Dialect, Enum
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator[datetime]):
    """Zapisuje UTC i zawsze zwraca datetime ze strefą UTC (SQLite gubi strefę)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Naive datetime is not allowed; use timezone-aware UTC")
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def str_enum(enum_cls: type[StrEnum]) -> Enum:
    """Kolumna enum przechowująca wartości (np. "write"), nie nazwy członków."""
    return Enum(
        enum_cls,
        native_enum=False,
        length=32,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )
```

Utwórz puste `app/db/__init__.py` i `tests/db/__init__.py`.

- [ ] **1.4: Uruchom — GREEN.** `pytest tests/db/test_types.py -q` → `2 passed`.

- [ ] **1.5: Commit.** `git add backend/app/db backend/tests/db && git commit -m "feat(db): add declarative base and UTC datetime type"`

---

### Krok 2: Modele

**Pliki:**
- Utwórz: `backend/app/models/__init__.py`, `user.py`, `repository.py`, `lease.py`, `activity.py`, `appeal.py`, `audit_log.py` (w `backend/app/models/`)

**Interfejsy:**
- Produkuje: `User`, `Repository`, `Lease`, `ActivityEvent`, `Appeal`, `AuditLog` (importowalne z `app.models`); relacje `Lease.user`, `Lease.repo`, `ActivityEvent.user`, `ActivityEvent.repo`, `Appeal.lease`, `Appeal.user`, `Appeal.repo`.

- [ ] **2.1: Dodaj modele** (testy w Kroku 3 — modele i sesja tworzą jedną testowalną całość).

`backend/app/models/user.py`:

```python
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import str_enum
from app.domain.enums import Team


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    login: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    team: Mapped[Team | None] = mapped_column(str_enum(Team), nullable=True)
    is_admin: Mapped[bool] = mapped_column(default=False)
```

`backend/app/models/repository.py`:

```python
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    owner: Mapped[str] = mapped_column(String(64))
    default_branch: Mapped[str] = mapped_column(String(64), default="main")
    default_lease_days: Mapped[int] = mapped_column(default=30)
```

`backend/app/models/lease.py`:

```python
from datetime import datetime

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime, str_enum
from app.domain.enums import Permission
from app.models.repository import Repository
from app.models.user import User


class Lease(Base):
    __tablename__ = "leases"
    __table_args__ = (UniqueConstraint("user_id", "repo_id", name="uq_lease_user_repo"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"), index=True)
    current_role: Mapped[Permission] = mapped_column(str_enum(Permission))
    granted_at: Mapped[datetime] = mapped_column(UTCDateTime())
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    user: Mapped[User] = relationship(lazy="selectin")
    repo: Mapped[Repository] = relationship(lazy="selectin")
```

`backend/app/models/activity.py`:

```python
from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime, str_enum
from app.domain.enums import ActionType, Permission
from app.models.repository import Repository
from app.models.user import User


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    action_type: Mapped[ActionType] = mapped_column(str_enum(ActionType))
    required_permission: Mapped[Permission] = mapped_column(str_enum(Permission))

    user: Mapped[User] = relationship(lazy="selectin")
    repo: Mapped[Repository] = relationship(lazy="selectin")
```

`backend/app/models/appeal.py`:

```python
from datetime import datetime

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime, str_enum
from app.domain.enums import AppealStatus, Permission
from app.models.lease import Lease
from app.models.repository import Repository
from app.models.user import User


class Appeal(Base):
    __tablename__ = "appeals"

    id: Mapped[int] = mapped_column(primary_key=True)
    lease_id: Mapped[int] = mapped_column(ForeignKey("leases.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    repo_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"))
    requested_role: Mapped[Permission] = mapped_column(str_enum(Permission))
    justification: Mapped[str] = mapped_column(Text)
    status: Mapped[AppealStatus] = mapped_column(str_enum(AppealStatus), default=AppealStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime())
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    lease: Mapped[Lease] = relationship(lazy="selectin")
    user: Mapped[User] = relationship(lazy="selectin")
    repo: Mapped[Repository] = relationship(lazy="selectin")
```

`backend/app/models/audit_log.py`:

```python
from datetime import datetime

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, str_enum
from app.domain.enums import ActorType, AuditAction


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    actor_type: Mapped[ActorType] = mapped_column(str_enum(ActorType))
    actor_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action: Mapped[AuditAction] = mapped_column(str_enum(AuditAction))
    target: Mapped[str] = mapped_column(String(256))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    justification: Mapped[str | None] = mapped_column(Text, nullable=True)
```

`backend/app/models/__init__.py`:

```python
from app.models.activity import ActivityEvent
from app.models.appeal import Appeal
from app.models.audit_log import AuditLog
from app.models.lease import Lease
from app.models.repository import Repository
from app.models.user import User

__all__ = ["ActivityEvent", "Appeal", "AuditLog", "Lease", "Repository", "User"]
```

---

### Krok 3: Sesja, `init_db`, fixture'y i fabryki

**Pliki:**
- Utwórz: `backend/app/db/session.py`, `backend/tests/factories.py`
- Zmień: `backend/tests/conftest.py` (dopisz fixture'y `engine` i `session`)
- Test: `backend/tests/db/test_models.py`

**Interfejsy:**
- Produkuje: `create_engine(url: str) -> AsyncEngine`, `create_session_factory(engine) -> async_sessionmaker[AsyncSession]`, `init_db(engine) -> None`; fixture'y `engine`, `session`; fabryki `make_user`, `make_repo`, `make_lease`, `make_event`.

- [ ] **3.1: Dopisz fixture'y** na końcu `backend/tests/conftest.py`:

```python
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.session import create_engine, create_session_factory, init_db


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    db_engine = create_engine("sqlite+aiosqlite:///:memory:")
    await init_db(db_engine)
    yield db_engine
    await db_engine.dispose()


@pytest.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with create_session_factory(engine)() as db_session:
        yield db_session
```

(Importy przenieś na górę pliku obok `import pytest`.)

- [ ] **3.2: Dodaj fabryki** `backend/tests/factories.py`:

```python
"""Fabryki rekordów testowych współdzielone przez Zadania 4–11."""

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import EVENT_PERMISSION, ActionType, Permission, Team
from app.models import ActivityEvent, Lease, Repository, User


async def make_user(
    session: AsyncSession, login: str, *, team: Team | None = Team.DEV, is_admin: bool = False
) -> User:
    user = User(login=login, name=login.split("-")[0].capitalize(), team=team, is_admin=is_admin)
    session.add(user)
    await session.flush()
    return user


async def make_repo(session: AsyncSession, name: str, *, owner: str = "longtails", lease_days: int = 30) -> Repository:
    repo = Repository(name=name, owner=owner, default_lease_days=lease_days)
    session.add(repo)
    await session.flush()
    return repo


async def make_lease(
    session: AsyncSession,
    user: User,
    repo: Repository,
    role: Permission,
    *,
    granted_at: datetime,
    expires_at: datetime | None,
    revoked_at: datetime | None = None,
) -> Lease:
    lease = Lease(
        user_id=user.id,
        repo_id=repo.id,
        current_role=role,
        granted_at=granted_at,
        expires_at=expires_at,
        revoked_at=revoked_at,
    )
    session.add(lease)
    await session.flush()
    await session.refresh(lease)
    return lease


async def make_event(
    session: AsyncSession, user: User, repo: Repository, action_type: ActionType, timestamp: datetime
) -> ActivityEvent:
    event = ActivityEvent(
        user_id=user.id,
        repo_id=repo.id,
        timestamp=timestamp,
        action_type=action_type,
        required_permission=EVENT_PERMISSION[action_type],
    )
    session.add(event)
    await session.flush()
    return event
```

- [ ] **3.3: Napisz testy** `backend/tests/db/test_models.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.session import create_session_factory
from app.domain.enums import ActionType, ActorType, AppealStatus, AuditAction, Permission, Team
from app.models import ActivityEvent, Appeal, AuditLog, Lease, User
from tests.factories import make_event, make_lease, make_repo, make_user

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def test_init_db_creates_tables(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        tables = await connection.run_sync(lambda sync: inspect(sync).get_table_names())

    assert set(tables) >= {"users", "repositories", "leases", "activity_events", "appeals", "audit_log"}


async def test_models_persist_required_fields(session: AsyncSession) -> None:
    user = await make_user(session, "kamil-dev", team=Team.DEV)
    repo = await make_repo(session, "core-api")
    lease = await make_lease(
        session, user, repo, Permission.WRITE, granted_at=NOW, expires_at=NOW + timedelta(days=30)
    )
    await make_event(session, user, repo, ActionType.PUSH, NOW)
    session.add(
        Appeal(
            lease_id=lease.id, user_id=user.id, repo_id=repo.id, requested_role=Permission.WRITE,
            justification="Release v2.1", created_at=NOW,
        )
    )
    session.add(
        AuditLog(
            timestamp=NOW, actor_type=ActorType.ADMIN, actor_id="tomasz-admin",
            action=AuditAction.LEASE_EXTENDED, target="longtails/core-api:kamil-dev",
        )
    )
    await session.commit()

    stored_lease = await session.scalar(select(Lease))
    stored_event = await session.scalar(select(ActivityEvent))
    stored_appeal = await session.scalar(select(Appeal))
    assert stored_lease.user.login == "kamil-dev"
    assert stored_lease.repo.name == "core-api"
    assert stored_lease.expires_at == NOW + timedelta(days=30)
    assert stored_lease.revoked_at is None
    assert stored_event.required_permission is Permission.WRITE
    assert stored_appeal.status is AppealStatus.PENDING
    assert stored_appeal.resolved_at is None
    assert not hasattr(Lease, "last_activity_at")


async def test_enums_are_stored_as_values(session: AsyncSession) -> None:
    user = await make_user(session, "marta-qa", team=Team.QA)
    repo = await make_repo(session, "qa-automation")
    await make_lease(session, user, repo, Permission.WRITE, granted_at=NOW, expires_at=NOW)
    await session.commit()

    raw = (await session.execute(text("SELECT current_role FROM leases"))).scalar_one()
    team = (await session.execute(text("SELECT team FROM users"))).scalar_one()

    assert raw == "write"
    assert team == "QA"


async def test_lease_pair_is_unique(session: AsyncSession) -> None:
    user = await make_user(session, "anna-dev")
    repo = await make_repo(session, "auth-service")
    await make_lease(session, user, repo, Permission.READ, granted_at=NOW, expires_at=NOW)

    with pytest.raises(IntegrityError):
        await make_lease(session, user, repo, Permission.WRITE, granted_at=NOW, expires_at=NOW)


async def test_memory_engine_shares_schema_between_sessions(engine: AsyncEngine) -> None:
    factory = create_session_factory(engine)
    async with factory() as first:
        await make_user(first, "piotr-dev")
        await first.commit()

    async with factory() as second:
        logins = (await second.scalars(select(User.login))).all()

    assert logins == ["piotr-dev"]
```

- [ ] **3.4: Uruchom — RED.** `pytest tests/db/test_models.py -q` → `ModuleNotFoundError: No module named 'app.db.session'`.

- [ ] **3.5: Dodaj `backend/app/db/session.py`:**

```python
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.base import Base


def create_engine(url: str) -> AsyncEngine:
    if ":memory:" in url:
        return create_async_engine(url, poolclass=StaticPool, connect_args={"check_same_thread": False})
    return create_async_engine(url)


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def init_db(engine: AsyncEngine) -> None:
    import app.models  # noqa: F401  (rejestruje modele w Base.metadata)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
```

- [ ] **3.6: Uruchom — GREEN.** `pytest tests/db -q` → `7 passed`.

- [ ] **3.7: Commit.**

```bash
git add backend/app/models backend/app/db/session.py backend/tests/conftest.py backend/tests/factories.py backend/tests/db/test_models.py
git commit -m "feat(db): add ORM models, async session and test factories"
```

---

### Krok 4: Weryfikacja

- [ ] **4.1:** Z `backend/`: `pytest -q && ruff check . && ruff format --check .` → zielone.
- [ ] **4.2:** `wc -l app/models/*.py app/db/*.py tests/factories.py` → każdy ≤ 300.
- [ ] **4.3:** PR `feat/task-03-orm-models` → `main`. W opisie PR zaznacz, że pola są kontraktem z ADR 0006 §5 (zależą od nich Zadania 4–11).
