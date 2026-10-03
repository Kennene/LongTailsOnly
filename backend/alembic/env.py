import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.core.config import settings
from app.db.base import Base
from app.db.session import build_engine

target_metadata = Base.metadata


def run_migrations_on(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata,
                      render_as_batch=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_with_own_engine() -> None:
    engine = build_engine(settings.database_url)
    async with engine.connect() as connection:
        await connection.run_sync(run_migrations_on)
        await connection.commit()
    await engine.dispose()


def run_migrations_offline() -> None:
    context.configure(url=settings.database_url, target_metadata=target_metadata,
                      render_as_batch=True, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
elif (connection := context.config.attributes.get("connection")) is not None:
    run_migrations_on(connection)  # called from app.db.migrations (tests, startup, demo reset)
else:
    if context.config.config_file_name is not None:
        fileConfig(context.config.config_file_name)  # CLI only: keeps app/pytest logging untouched
    asyncio.run(run_with_own_engine())  # called from the `alembic` CLI
