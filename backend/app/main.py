from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.github_mock.http import register_github_error_handlers
from app.api.github_mock.router import router as github_mock_router
from app.api.v1.demo import router as demo_router
from app.api.v1.errors import service_error_handler
from app.api.v1.router import v1_router
from app.api.v1.simulation import router as simulation_router
from app.core.time_provider import time_provider
from app.db.bootstrap import prepare_database
from app.db.session import engine, get_session
from app.services.errors import ServiceError


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await prepare_database(engine, time_provider)
    yield


app = FastAPI(title="LongTailsOnly API", lifespan=lifespan)
app.add_exception_handler(ServiceError, service_error_handler)
app.include_router(demo_router)
app.include_router(simulation_router)
app.include_router(github_mock_router)
app.include_router(v1_router)
register_github_error_handlers(app)


@app.get("/health")
async def health(session: Annotated[AsyncSession, Depends(get_session)]) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}
