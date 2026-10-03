from datetime import UTC, datetime, timedelta

from app.domain.baseline_rules import BaselineCandidate, MemberActivity, compute_baseline
from app.domain.enums import Role

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
TEAM = set(range(1, 13))  # 12 members


def act(user_id: int, repo_id: int, role: Role = Role.WRITE, days_ago: float = 1) -> MemberActivity:
    return MemberActivity(user_id, repo_id, role, NOW - timedelta(days=days_ago))


def test_exactly_half_of_the_team_is_enough() -> None:
    activity = [act(user, 1) for user in range(1, 7)] + [act(user, 2) for user in range(1, 6)]

    assert compute_baseline(TEAM, activity, NOW) == [BaselineCandidate(repo_id=1, active_members=6,
                                                                       proposed_role=Role.WRITE)]


def test_proposes_the_lowest_sufficient_role() -> None:
    mostly_readers = [act(1, 1)] + [act(user, 1, Role.READ) for user in range(2, 7)]
    half_writers = [act(user, 2) for user in range(1, 4)] + [act(user, 2, Role.READ) for user in range(4, 7)]

    roles = {c.repo_id: c.proposed_role for c in compute_baseline(TEAM, mostly_readers + half_writers, NOW)}

    assert roles == {1: Role.READ, 2: Role.WRITE}


def test_member_is_counted_once_with_highest_level() -> None:
    activity = [act(user, 1, Role.READ) for user in range(1, 7)] + [act(user, 1) for user in range(1, 4)]

    (candidate,) = compute_baseline(TEAM, activity, NOW)

    assert (candidate.active_members, candidate.proposed_role) == (6, Role.WRITE)


def test_admin_is_never_proposed() -> None:
    assert compute_baseline(TEAM, [act(user, 1, Role.ADMIN) for user in TEAM], NOW) == []


def test_non_members_and_stale_events_do_not_count() -> None:
    outsiders = [act(user, 1) for user in range(100, 110)]
    stale = [act(user, 1, days_ago=31) for user in TEAM]

    assert compute_baseline(TEAM, outsiders + stale, NOW) == []


def test_window_start_is_inclusive() -> None:
    on_edge = [act(user, 1, days_ago=30) for user in range(1, 7)]
    too_old = NOW - timedelta(days=30, seconds=1)
    just_outside = [MemberActivity(user, 2, Role.WRITE, too_old) for user in range(1, 7)]

    assert [c.repo_id for c in compute_baseline(TEAM, on_edge + just_outside, NOW)] == [1]


def test_future_events_after_clock_reset_are_ignored() -> None:
    assert compute_baseline(TEAM, [act(user, 1, days_ago=-1) for user in TEAM], NOW) == []


def test_empty_team_has_no_baseline() -> None:
    assert compute_baseline(set(), [act(1, 1)], NOW) == []


def test_candidates_are_sorted_by_repo_id() -> None:
    activity = [act(user, repo) for repo in (3, 1, 2) for user in range(1, 7)]

    assert [c.repo_id for c in compute_baseline(TEAM, activity, NOW)] == [1, 2, 3]
