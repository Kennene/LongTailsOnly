from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.github_mock.http import register_github_error_handlers
from app.api.github_mock.router import router as github_router
from app.api.v1.simulation import router as simulation_router
from app.core.config import Settings
from app.core.time_provider import TimeProvider
from app.db.demo_data import load_demo_data
from app.db.session import create_engine_and_sessionmaker, init_db


def create_app(settings: Settings | None = None, clock: TimeProvider | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        await init_db(app.state.engine)
        if settings.seed_demo:
            async with app.state.sessionmaker() as session:
                await load_demo_data(
                    session, app.state.clock.get_current_time(), settings.github_org, settings.default_lease_days
                )
        yield
        await app.state.engine.dispose()

    app = FastAPI(title="GitHub Access Lease Governor", lifespan=lifespan)
    engine, sessionmaker = create_engine_and_sessionmaker(settings.database_url)
    app.state.settings = settings
    app.state.clock = clock or TimeProvider()
    app.state.engine = engine
    app.state.sessionmaker = sessionmaker
    register_github_error_handlers(app)
    app.include_router(github_router)
    app.include_router(simulation_router)
    return app


app = create_app()
