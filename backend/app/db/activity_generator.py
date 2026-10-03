"""Deterministic activity history for the demo scenarios (see demo_scenarios.py).

`generate_activity_specs` is pure; `persist_activity_specs` writes rows with the injected
`now`. Neither touches leases (this is history, not `lease_service.record_activity`).
"""
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import demo_scenarios as sc
from app.domain.github_events import EVENT_REQUIRED_PERMISSION
from app.models import ActivityEvent, Repository, User


@dataclass(frozen=True)
class ActivityEventSpec:
    login: str
    repo: str
    action_type: str
    age_days: int
    hour_offset: int = 0  # extra hours (0..11) on top of age_days, jitter only


def spec_timestamp(spec: ActivityEventSpec, now: datetime) -> datetime:
    return now - timedelta(days=spec.age_days, hours=spec.hour_offset)


def generate_activity_specs(seed: int = 2026) -> list[ActivityEventSpec]:
    rng = random.Random(seed)
    specs: list[ActivityEventSpec] = []

    def add(login: str, repo: str, kind: str, age: int) -> None:
        specs.append(ActivityEventSpec(login, repo, kind, age, rng.randrange(12)))

    for repo, numbers in sc.PUSHERS.items():
        for n in numbers:
            login = f"dev-{n:02d}"
            age = sc.BACKGROUND_PUSH_AGE[login]
            add(login, repo, "PushEvent", age)
            add(login, repo, "PushEvent", age + 3)
    for repo, numbers in sc.MERGERS.items():
        for n in numbers:
            add(f"dev-{n:02d}", repo, "PullRequestEvent", sc.BACKGROUND_PUSH_AGE[f"dev-{n:02d}"] + 1)
    for n in sc.MOBILE_APP_REVIEWERS:
        add(f"dev-{n:02d}", "mobile-app", "PullRequestReviewEvent", 3 + n)
        add(f"dev-{n:02d}", "mobile-app", "IssueCommentEvent", 5 + n)

    # Scenario A
    for age in (18, 40, 55):
        add("dev-kamil", "payment-gw", "PushEvent", age)
    for age in (2, 6, 11):
        add("dev-kamil", "payment-gw", "PullRequestReviewEvent", age)
    add("dev-kamil", "payment-gw", "IssueCommentEvent", 4)

    for repo, who in sc.QA_ACTIVITY.items():
        for login, (kind, age) in who.items():
            add(login, repo, kind, age)
    for repo, who in sc.QA_LABELERS.items():
        for login, age in who.items():
            add(login, repo, "IssuesEvent", age)

    add(sc.ADMIN_LOGIN, "infra-terraform", "PushEvent", 2)
    add(sc.ADMIN_LOGIN, "infra-terraform", "PushEvent", 9)
    add(sc.ADMIN_LOGIN, "docs-site", "PublicEvent", 20)
    return specs


async def persist_activity_specs(session: AsyncSession, specs: Sequence[ActivityEventSpec], now: datetime) -> int:
    users = {u.login: u.id for u in (await session.scalars(select(User))).all()}
    repos = {r.name: r.id for r in (await session.scalars(select(Repository))).all()}
    existing = {
        (e.user_id, e.repo_id, e.timestamp, e.action_type)
        for e in (await session.scalars(select(ActivityEvent))).all()
    }
    added = 0
    for spec in specs:
        user_id, repo_id, ts = users[spec.login], repos[spec.repo], spec_timestamp(spec, now)
        key = (user_id, repo_id, ts, spec.action_type)
        if key in existing:
            continue
        session.add(ActivityEvent(
            user_id=user_id, repo_id=repo_id, timestamp=ts, action_type=spec.action_type,
            required_permission=EVENT_REQUIRED_PERMISSION[spec.action_type],
        ))
        existing.add(key)
        added += 1
    await session.commit()
    return added
