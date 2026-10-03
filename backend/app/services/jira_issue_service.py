"""Issues, changelog, comments and audit records of the Jira mock, derived from `ActivityEvent` (ADR 0011)."""
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.jira_mock.http import JiraError
from app.core.config import Settings
from app.domain.enums import ActionType, Provider
from app.domain.jira_events import ISSUE_ACTIONS, issue_key, issue_number
from app.domain.jira_roles import account_id
from app.models import ActivityEvent, Repository, User
from app.ports.clock import ClockPort
from app.services.jira_mock_service import JiraMockService
from app.services.jql import JqlError, Query, parse_jql


@dataclass
class IssueView:
    key: str
    project: Repository
    events: list[tuple[ActivityEvent, User]] = field(default_factory=list)

    @property
    def created(self) -> datetime:
        return min(e.timestamp for e, _ in self.events)

    @property
    def updated(self) -> datetime:
        return max(e.timestamp for e, _ in self.events)

    @property
    def reporter(self) -> User:
        return min(self.events, key=lambda pair: (pair[0].timestamp, pair[0].id))[1]

    @property
    def updates(self) -> list[tuple[ActivityEvent, User]]:
        return [p for p in self.events if p[0].action_type is ActionType.JIRA_ISSUE_UPDATED]

    @property
    def assignee(self) -> User | None:
        updates = sorted(self.updates, key=lambda pair: (pair[0].timestamp, pair[0].id))
        return updates[-1][1] if updates else None

    @property
    def comments(self) -> list[tuple[ActivityEvent, User]]:
        return sorted(
            (p for p in self.events if p[0].action_type is ActionType.JIRA_COMMENT_CREATED),
            key=lambda pair: (pair[0].timestamp, pair[0].id),
        )

    def actor_ids(self, role: str) -> set[str]:
        if role == "reporter":
            return {account_id(self.reporter.login)}
        if role == "assignee":
            return {account_id(self.assignee.login)} if self.assignee else set()
        return {account_id(u.login) for _, u in self.comments}


class JiraIssueService:
    def __init__(self, session: AsyncSession, settings: Settings, clock: ClockPort) -> None:
        self.session = session
        self.clock = clock
        self.reads = JiraMockService(session, settings)
        self.site = settings.jira_site

    async def _events(self, actions: frozenset[ActionType] | set[ActionType]) -> list[tuple[ActivityEvent, User, Repository]]:
        query = (
            select(ActivityEvent, User, Repository)
            .join(User, User.id == ActivityEvent.user_id).join(Repository, Repository.id == ActivityEvent.repo_id)
            .where(
                Repository.provider == Provider.JIRA, Repository.owner == self.site,
                ActivityEvent.action_type.in_(actions),
            )
            .order_by(ActivityEvent.timestamp, ActivityEvent.id)
        )
        return [(e, u, r) for e, u, r in (await self.session.execute(query)).all()]

    async def issues(self) -> list[IssueView]:
        rows = await self._events(ISSUE_ACTIONS)
        if not rows:
            return []
        origin = min(event.id for event, _, _ in rows)  # grouping must not depend on the clock
        now = self.clock.get_current_time()
        grouped: dict[tuple[int, int], IssueView] = {}
        for event, user, repo in rows:
            slot = (repo.id, issue_number(event.id, origin))
            view = grouped.setdefault(slot, IssueView(issue_key(repo.name, event.id, origin), repo))
            if event.timestamp <= now:  # the feed never shows the future
                view.events.append((event, user))
        return [v for v in grouped.values() if v.events]

    async def search(self, jql: str, max_results: int, token: str | None) -> tuple[list[IssueView], str | None]:
        now = self.clock.get_current_time()
        try:
            query = parse_jql(jql, now)
        except JqlError as exc:
            raise JiraError(400, str(exc)) from None
        try:
            offset = int(token) if token else 0
        except ValueError:
            raise JiraError(400, "Invalid nextPageToken.") from None
        matched = [i for i in await self.issues() if self._matches(i, query)]
        key = (lambda i: i.created) if query.order_by == "created" else (lambda i: i.updated)
        matched.sort(key=lambda i: (key(i), i.key), reverse=query.descending)
        window = matched[offset : offset + max_results]
        more = offset + len(window) < len(matched)
        return window, str(offset + len(window)) if more else None

    @staticmethod
    def _matches(issue: IssueView, query: Query) -> bool:
        if query.project and issue.project.name != query.project:
            return False
        if query.since and issue.updated < query.since:
            return False
        return not (query.actor_field and query.actor not in issue.actor_ids(query.actor_field))

    async def issue(self, key: str) -> IssueView:
        for candidate in await self.issues():
            if candidate.key == key.upper():
                return candidate
        raise JiraError(404, "Issue does not exist or you do not have permission to see it.")

    async def audit_records(self) -> list[tuple[ActivityEvent, User, Repository]]:
        now = self.clock.get_current_time()
        rows = [r for r in await self._events({ActionType.JIRA_PROJECT_UPDATED}) if r[0].timestamp <= now]
        return sorted(rows, key=lambda row: (row[0].timestamp, row[0].id), reverse=True)
