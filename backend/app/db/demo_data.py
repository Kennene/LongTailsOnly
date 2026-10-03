"""Loads the demo organisation: users, repos, activity history and the leases that follow from it.

Leases are derived from the generated history so that data and leases always agree:
write if the user pushed in the repo (expires 30 days after the newest push), otherwise read
(expires 30 days after the newest review/comment). The org owner is a permanent admin everywhere.
"""
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import demo_scenarios as sc
from app.db.activity_generator import ActivityEventSpec, generate_activity_specs, persist_activity_specs, spec_timestamp
from app.domain.github_events import LEASE_RENEWING_EVENT_TYPES
from app.models import ActivityEvent, Lease, Repository, User

GRANTED_DAYS_AGO = 90


def _display_name(login: str) -> str:
    return login.replace("-", " ").title()


async def ensure_population(session: AsyncSession, org: str) -> None:
    have_users = set((await session.scalars(select(User.login))).all())
    have_repos = set((await session.scalars(select(Repository.name).where(Repository.owner == org))).all())
    session.add_all(
        User(login=login, name=_display_name(login), team=team, is_admin=login == sc.ADMIN_LOGIN)
        for login, team in sc.TEAM_OF.items() if login not in have_users
    )
    session.add_all(Repository(name=name, owner=org, default_branch="main") for name in sc.REPOS if name not in have_repos)
    await session.commit()


def derive_leases(
    specs: list[ActivityEventSpec], now: datetime, ttl_days: int
) -> list[tuple[str, str, str, datetime | None]]:
    """(login, repo, role, expires_at) for every non-admin user with renewing activity in a repo."""
    newest: dict[tuple[str, str], dict[str, datetime]] = defaultdict(dict)
    for s in specs:
        if s.login == sc.ADMIN_LOGIN or s.action_type not in LEASE_RENEWING_EVENT_TYPES:
            continue
        level = "write" if s.action_type == "PushEvent" else "read"
        ts = spec_timestamp(s, now)
        slot = newest[(s.login, s.repo)]
        slot[level] = max(ts, slot.get(level, ts))
    ttl = timedelta(days=ttl_days)
    return [
        (login, repo, "write" if "write" in levels else "read", levels["write" if "write" in levels else "read"] + ttl)
        for (login, repo), levels in newest.items()
    ]


async def load_demo_data(session: AsyncSession, now: datetime, org: str, ttl_days: int = 30) -> None:
    await ensure_population(session, org)
    if await session.scalar(select(ActivityEvent.id).limit(1)) is not None:
        return  # already loaded: history is anchored to the first load, a restart must not shift it
    specs = generate_activity_specs()
    await persist_activity_specs(session, specs, now)

    users = {u.login: u.id for u in (await session.scalars(select(User))).all()}
    repos = {r.name: r.id for r in (await session.scalars(select(Repository))).all()}
    have = {(l.user_id, l.repo_id) for l in (await session.scalars(select(Lease))).all()}
    granted = now - timedelta(days=GRANTED_DAYS_AGO)
    wanted: list[tuple[str, str, str, datetime | None]] = [
        (sc.ADMIN_LOGIN, repo, "admin", None) for repo in sc.REPOS
    ]
    wanted += derive_leases(specs, now, ttl_days)
    expired = now - timedelta(days=20)
    wanted += [(login, "legacy-reports", role, expired) for login, role in sc.EXPIRED_LEGACY_LEASES.items()]
    for login, repo, role, expires in wanted:
        if (users[login], repos[repo]) not in have:
            session.add(Lease(user_id=users[login], repo_id=repos[repo], current_role=role, granted_at=granted, expires_at=expires))
    await session.commit()
