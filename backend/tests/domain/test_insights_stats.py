import pytest

from app.domain.enums import LeaseStatus, Recommendation, Role
from app.domain.insights import DashboardCounters, LeaseSnapshot, MemberSnapshot, compute_dashboard_counters

MEMBERS = [
    MemberSnapshot("tomasz-admin", None, None, True),
    MemberSnapshot("kamil", "dev", "DEV", False),
    MemberSnapshot("nowy-dev", "dev", "DEV", False),
    MemberSnapshot("piotr", "qa", "QA", False),
    MemberSnapshot("marta", "qa", "QA", False),
]


def snapshot(lease_id: int, login: str, status: LeaseStatus | None, recommendation: Recommendation | None = None,
             role: Role = Role.WRITE, is_active: bool = True,
             days_remaining: int | None = None) -> LeaseSnapshot:
    return LeaseSnapshot(lease_id, login, f"repo-{lease_id}", role, days_remaining, is_active, status, recommendation)


def lapsed(lease_id: int, days_ago: int, login: str = "kamil", **overrides: object) -> LeaseSnapshot:
    """Dostęp po terminie: `days_ago` dni od wygaśnięcia, więc `days_remaining` jest ujemne."""
    return snapshot(lease_id, login, LeaseStatus.EXPIRED, Recommendation.REVOKE,
                    days_remaining=-days_ago, **overrides)


def test_counters_follow_adr_0010_definitions() -> None:
    leases = [
        snapshot(1, "tomasz-admin", None, role=Role.ADMIN),
        snapshot(2, "kamil", LeaseStatus.WARNING, Recommendation.DOWNSCOPE, days_remaining=5),
        snapshot(3, "kamil", LeaseStatus.ACTIVE, Recommendation.KEEP, days_remaining=20),
        lapsed(4, 15, login="marta"),
        lapsed(5, 15, login="piotr", is_active=False),
    ]

    counters = compute_dashboard_counters(leases, MEMBERS, pending_appeals=2)

    assert counters == DashboardCounters(
        active=1, warning=1, expired=1, permanent=1, revoked=1,
        downscope_recommendations=1, revoke_recommendations=1, pending_appeals=2, onboarding_candidates=2,
    )


def test_expired_counter_ignores_leases_lapsed_before_the_window() -> None:
    leases = [lapsed(1, 2), lapsed(2, 29), lapsed(3, 40), lapsed(4, 365)]

    counters = compute_dashboard_counters(leases, MEMBERS, pending_appeals=0)

    assert counters.expired == 2
    assert (counters.active, counters.warning, counters.revoked) == (0, 0, 0)


@pytest.mark.parametrize(("days_ago", "expected"), [(29, 1), (30, 1), (31, 0)])
def test_expired_window_covers_thirty_whole_days(days_ago: int, expected: int) -> None:
    counters = compute_dashboard_counters([lapsed(1, days_ago)], MEMBERS, pending_appeals=0)

    assert counters.expired == expected


def test_expired_lease_without_days_remaining_is_not_counted() -> None:
    """Bez liczby dni po terminie nie da się powiedzieć, że dostęp wpadł w okno — nie liczymy go."""
    counters = compute_dashboard_counters([snapshot(1, "kamil", LeaseStatus.EXPIRED, Recommendation.REVOKE)],
                                          MEMBERS, pending_appeals=0)

    assert counters.expired == 0


def test_empty_organisation_has_zero_counters() -> None:
    assert compute_dashboard_counters([], [], pending_appeals=0) == DashboardCounters(0, 0, 0, 0, 0, 0, 0, 0, 0)
