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
             role: Role = Role.WRITE, is_active: bool = True) -> LeaseSnapshot:
    return LeaseSnapshot(lease_id, login, f"repo-{lease_id}", role, is_active, status, recommendation)


def test_counters_follow_adr_0010_definitions() -> None:
    leases = [
        snapshot(1, "tomasz-admin", None, role=Role.ADMIN),
        snapshot(2, "kamil", LeaseStatus.WARNING, Recommendation.DOWNSCOPE),
        snapshot(3, "kamil", LeaseStatus.ACTIVE, Recommendation.KEEP),
        snapshot(4, "marta", LeaseStatus.EXPIRED, Recommendation.REVOKE),
        snapshot(5, "piotr", LeaseStatus.EXPIRED, Recommendation.REVOKE, is_active=False),
    ]

    counters = compute_dashboard_counters(leases, MEMBERS, pending_appeals=2)

    assert counters == DashboardCounters(
        active=1, warning=1, expired=1, permanent=1, revoked=1,
        downscope_recommendations=1, revoke_recommendations=1, pending_appeals=2, onboarding_candidates=2,
    )


def test_empty_organisation_has_zero_counters() -> None:
    assert compute_dashboard_counters([], [], pending_appeals=0) == DashboardCounters(0, 0, 0, 0, 0, 0, 0, 0, 0)
