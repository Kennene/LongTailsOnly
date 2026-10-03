from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.errors import ServiceError
from app.services.insights_service import get_dashboard_stats, get_permission_graph
from tests.insights_world import build_insights_world

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def test_dashboard_stats_from_lease_engine(session: AsyncSession) -> None:
    await build_insights_world(session, NOW)

    stats = await get_dashboard_stats(session, now=NOW)

    assert stats.model_dump(exclude={"generated_at"}) == {
        "active": 1, "warning": 1, "expired": 1, "expired_window_days": 30, "permanent": 1, "revoked": 1,
        "downscope_recommendations": 1, "revoke_recommendations": 1, "pending_appeals": 1,
        "onboarding_candidates": 2,
    }
    assert stats.generated_at == NOW


async def test_graph_for_dev_team(session: AsyncSession) -> None:
    await build_insights_world(session, NOW)

    graph = await get_permission_graph(session, now=NOW, team="dev")

    assert [node.id for node in graph.nodes] == [
        "team:dev", "user:ania", "user:jan", "user:kamil", "user:nowy-dev",
        "repo:core-api", "repo:legacy-reports", "repo:payment-service",
    ]
    kamil = next(edge for edge in graph.edges if edge.source == "user:kamil" and edge.data.kind == "lease")
    assert (kamil.label, kamil.animated, kamil.data.recommendation) == ("write", True, "DOWNSCOPE")


async def test_full_graph_has_every_repo_skips_revoked_and_marks_admin_permanent(session: AsyncSession) -> None:
    await build_insights_world(session, NOW)

    graph = await get_permission_graph(session, now=NOW)

    assert [n.id for n in graph.nodes if n.type == "repo"] == [
        "repo:core-api", "repo:legacy-reports", "repo:payment-service", "repo:qa-automation"]
    assert not [e for e in graph.edges if e.source == "user:marta" and e.data.kind == "lease"]
    admin_edge = next(e for e in graph.edges if e.source == "user:tomasz-admin")
    assert (admin_edge.data.status, admin_edge.animated) == ("PERMANENT", False)


async def test_unknown_team_is_404(session: AsyncSession) -> None:
    with pytest.raises(ServiceError) as error:
        await get_permission_graph(session, now=NOW, team="ops")

    assert error.value.status_code == 404
