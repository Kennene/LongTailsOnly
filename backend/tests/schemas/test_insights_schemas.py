from dataclasses import asdict
from datetime import UTC, datetime

from app.domain.enums import LeaseStatus, Recommendation, Role
from app.domain.insights import DashboardCounters, LeaseSnapshot, MemberSnapshot, build_graph_layout
from app.domain.lease_window import EXPIRED_WINDOW_DAYS
from app.schemas.insights import DashboardStats, PermissionGraph

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def test_permission_graph_matches_react_flow_shape() -> None:
    layout = build_graph_layout(
        [MemberSnapshot("kamil", "dev", "DEV", False)],
        ["core-api", "payment-service"],
        [LeaseSnapshot(42, "kamil", "payment-service", Role.WRITE, 5, True, LeaseStatus.WARNING,
                       Recommendation.DOWNSCOPE),
         LeaseSnapshot(43, "kamil", "core-api", Role.WRITE, 20, True, LeaseStatus.ACTIVE, Recommendation.KEEP)],
    )

    body = PermissionGraph.from_layout(layout).model_dump(mode="json")

    assert body["nodes"][1] == {"id": "user:kamil", "type": "user", "position": {"x": 320, "y": 0},
                                "data": {"label": "kamil", "team": "dev", "is_admin": False}}
    assert body["edges"][0] == {"id": "member:kamil", "source": "team:dev", "target": "user:kamil", "label": None,
                                "animated": False,
                                "data": {"kind": "membership", "role": None, "status": None, "recommendation": None}}
    assert body["edges"][1] == {"id": "lease:42", "source": "user:kamil", "target": "repo:payment-service",
                                "label": "write", "animated": True,
                                "data": {"kind": "lease", "role": "write", "status": "WARNING",
                                         "recommendation": "DOWNSCOPE"}}
    assert body["edges"][2]["animated"] is False


def test_dashboard_stats_serializes_counters() -> None:
    counters = DashboardCounters(31, 2, 2, 10, 0, 1, 2, 0, 1)

    body = DashboardStats(generated_at=NOW, expired_window_days=EXPIRED_WINDOW_DAYS,
                          **asdict(counters)).model_dump(mode="json")

    assert body == {"generated_at": "2026-10-03T12:00:00Z", "active": 31, "warning": 2, "expired": 2,
                    "expired_window_days": 30, "permanent": 10, "revoked": 0, "downscope_recommendations": 1,
                    "revoke_recommendations": 2, "pending_appeals": 0, "onboarding_candidates": 1}
