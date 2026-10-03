from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


def _config(connection: Connection) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.attributes["connection"] = connection
    return config


async def upgrade_to_head(target: AsyncEngine) -> None:
    async with target.begin() as conn:
        await conn.run_sync(lambda sync: command.upgrade(_config(sync), "head"))


async def downgrade_to_base(target: AsyncEngine) -> None:
    async with target.begin() as conn:
        await conn.run_sync(lambda sync: command.downgrade(_config(sync), "base"))
