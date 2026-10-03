from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import ActivityEvent, Repository, User
from app.ports.clock import ClockPort
from app.services.github_mock_service import GitHubMockService

EVENTS_WINDOW_DAYS = 90  # GitHub Events API only exposes the last 90 days...
EVENTS_MAX = 300  # ...and at most 300 events


class GitHubEventsService:
    def __init__(self, session: AsyncSession, settings: Settings, clock: ClockPort) -> None:
        self.session = session
        self.clock = clock
        self.reads = GitHubMockService(session, settings)

    async def list_events(self, owner: str, repo: str) -> tuple[Repository, list[tuple[ActivityEvent, User]]]:
        repository = await self.reads.get_repo(owner, repo)
        now = self.clock.get_current_time()
        query = (
            select(ActivityEvent, User)
            .join(User, User.id == ActivityEvent.user_id)
            .where(
                ActivityEvent.repo_id == repository.id,
                ActivityEvent.timestamp <= now,
                ActivityEvent.timestamp >= now - timedelta(days=EVENTS_WINDOW_DAYS),
            )
            .order_by(ActivityEvent.timestamp.desc(), ActivityEvent.id.desc())
            .limit(EVENTS_MAX)
        )
        rows = (await self.session.execute(query)).all()
        return repository, [(e, u) for e, u in rows]
