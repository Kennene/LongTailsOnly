"""Team baseline (ADR 0005, ADR 0014 §5.1). Pure function: no database, no clock."""

from collections import defaultdict
from collections.abc import Collection, Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain.enums import Role

BASELINE_WINDOW_DAYS = 30


@dataclass(frozen=True)
class MemberActivity:
    user_id: int
    repo_id: int
    permission: Role
    occurred_at: datetime


@dataclass(frozen=True)
class BaselineCandidate:
    repo_id: int
    active_members: int
    proposed_role: Role


def compute_baseline(
    member_ids: Collection[int],
    activity: Iterable[MemberActivity],
    now: datetime,
    window_days: int = BASELINE_WINDOW_DAYS,
) -> list[BaselineCandidate]:
    if not member_ids:
        return []
    window_start = now - timedelta(days=window_days)
    active: dict[int, set[int]] = defaultdict(set)
    writers: dict[int, set[int]] = defaultdict(set)
    for item in activity:
        if item.user_id not in member_ids or item.permission is Role.ADMIN:
            continue
        if not window_start <= item.occurred_at <= now:
            continue
        active[item.repo_id].add(item.user_id)
        if item.permission is Role.WRITE:
            writers[item.repo_id].add(item.user_id)

    candidates: list[BaselineCandidate] = []
    for repo_id in sorted(active):
        count = len(active[repo_id])
        if count * 2 < len(member_ids):
            continue
        role = Role.WRITE if len(writers[repo_id]) * 2 >= count else Role.READ
        candidates.append(BaselineCandidate(repo_id=repo_id, active_members=count, proposed_role=role))
    return candidates
