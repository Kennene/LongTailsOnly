"""Demo data for the Jira mock (scenarios E-H, ADR 0011), added on top of the GitHub seed.

Idempotent and deterministic. Jira issue events are written in groups of exactly three (one issue
each), because `domain.jira_events` derives issues from runs of three consecutive event ids.
"""
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.seed import seed_anchor
from app.db.seed_data import ADMIN_LOGIN, LEASE_DURATION_DAYS, LEASE_GRANTED_DAYS_AGO, REGULAR_DEVS, REGULAR_QA
from app.domain.enums import ActionType, Provider, Role
from app.domain.roles import is_at_least, required_permission_for
from app.models import ActivityEvent, Lease, Repository, User
from app.ports.clock import ClockPort

PROJECTS: tuple[str, ...] = ("PAY", "CORE", "AUTH", "QA", "OPS")
ADMIN_GRANTED_DAYS_AGO = 365
SETTINGS_PROJECT, SETTINGS_DAYS_AGO = "CORE", 40
CREATED, UPDATED, COMMENT = (
    ActionType.JIRA_ISSUE_CREATED, ActionType.JIRA_ISSUE_UPDATED, ActionType.JIRA_COMMENT_CREATED,
)


@dataclass(frozen=True)
class Ev:
    action: ActionType
    days_ago: int


@dataclass
class Spec:
    login: str
    project: str
    role: Role
    issues: list[tuple[Ev, ...]] = field(default_factory=list)  # each issue = exactly 3 events


def _issue(*events: Ev) -> tuple[Ev, ...]:
    if len(events) != 3:
        raise ValueError("a Jira seed issue must consist of exactly three events")
    return events


def _busy(login: str, project: str, updated: int) -> Spec:
    """Write access that is used: created earlier, updated and commented `updated` days ago."""
    return Spec(login, project, Role.WRITE, [_issue(Ev(CREATED, updated + 3), Ev(UPDATED, updated), Ev(COMMENT, updated))])


def _commenter(login: str, project: str, role: Role, first: int, step: int = 2) -> Spec:
    return Spec(login, project, role, [_issue(*(Ev(COMMENT, first + i * step) for i in range(3)))])


def specs() -> list[Spec]:
    result = [
        # E: Kamil's only change in PAY is 24 days old, but he still discusses issues -> down-scope to Viewer.
        Spec("kamil", "PAY", Role.WRITE, [_issue(Ev(UPDATED, 24), Ev(COMMENT, 6), Ev(COMMENT, 3))]),
        _busy("kamil", "CORE", 1),
        # F: Marta is a Member of QA but only comments.
        _commenter("marta", "QA", Role.WRITE, 5, 4),
        # G: access to a project that nobody uses.
        Spec("ania", "OPS", Role.WRITE),
        Spec("marta", "OPS", Role.READ),
    ]
    for i, (login, _) in enumerate(REGULAR_DEVS):
        result.append(_busy(login, "CORE", i + 1) if i < 8 else _commenter(login, "CORE", Role.WRITE, i))
        if i < 6:
            result.append(_busy(login, "AUTH", i + 2))
        if i < 7:
            result.append(_commenter(login, "PAY", Role.READ, i + 3, 3))
    result += [_commenter(login, "QA", Role.READ, i + 1, 3) for i, (login, _) in enumerate(REGULAR_QA)]
    return result


async def seed_jira_demo(session: AsyncSession, clock: ClockPort) -> int:
    """Create Jira projects, leases and activity once; returns the number of projects created."""
    if await session.scalar(select(Repository.id).where(Repository.provider == Provider.JIRA).limit(1)) is not None:
        return 0
    anchor = seed_anchor(clock)
    users = {u.login: u for u in (await session.scalars(select(User))).all()}
    if ADMIN_LOGIN not in users:
        return 0  # the base seed has not run
    projects = {
        key: Repository(name=key, owner=settings.jira_site, provider=Provider.JIRA) for key in PROJECTS
    }
    session.add_all(projects.values())
    for project in projects.values():
        session.add(Lease(
            user=users[ADMIN_LOGIN], repository=project, current_role=Role.ADMIN,
            granted_at=anchor - timedelta(days=ADMIN_GRANTED_DAYS_AGO),
        ))
    granted = anchor - timedelta(days=LEASE_GRANTED_DAYS_AGO)
    events: list[ActivityEvent] = []
    for spec in specs():
        user, project = users[spec.login], projects[spec.project]
        stamps = [(ev, anchor - timedelta(days=ev.days_ago) + timedelta(hours=10)) for issue in spec.issues for ev in issue]
        renewing = [t for ev, t in stamps if is_at_least(required_permission_for(ev.action), spec.role)]
        expires = max([granted, *renewing]) + timedelta(days=LEASE_DURATION_DAYS)
        session.add(Lease(user=user, repository=project, current_role=spec.role, granted_at=granted, expires_at=expires))
        events += [
            ActivityEvent(
                user=user, repository=project, timestamp=t, action_type=ev.action,
                required_permission=required_permission_for(ev.action),
            )
            for ev, t in stamps
        ]
    session.add_all(events)  # contiguous ids, issue by issue
    await session.flush()
    session.add(ActivityEvent(  # after the issue events so it cannot shift their grouping
        user=users[ADMIN_LOGIN], repository=projects[SETTINGS_PROJECT],
        timestamp=anchor - timedelta(days=SETTINGS_DAYS_AGO) + timedelta(hours=9),
        action_type=ActionType.JIRA_PROJECT_UPDATED, required_permission=required_permission_for(ActionType.JIRA_PROJECT_UPDATED),
    ))
    await session.commit()
    return len(projects)
