from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.database_vcs import DatabaseVCSAdapter
from app.api.v1.deps import get_vcs_provider
from app.core.time_provider import TimeProvider
from app.ports.service_registry import ServiceKind, all_services
from app.services.errors import ServiceError

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def test_both_adapters_are_registered() -> None:
    ids = {service.id for service in all_services()}
    assert {"github", "demo-tracker"} <= ids


def test_github_is_available_with_all_six_route_capabilities() -> None:
    github = next(s for s in all_services() if s.id == "github")
    assert github.kind is ServiceKind.VCS
    assert github.is_available is True
    assert set(github.capabilities) == {
        "dashboard", "leases", "appeals", "baseline", "graph", "audit",
    }


def test_demo_tracker_is_registered_but_unavailable() -> None:
    demo = next(s for s in all_services() if s.id == "demo-tracker")
    assert demo.kind is ServiceKind.ISSUE_TRACKER
    assert demo.is_available is False
    assert set(demo.capabilities) == {"dashboard", "audit"}


async def test_get_vcs_provider_defaults_to_github(session: AsyncSession) -> None:
    provider = get_vcs_provider(session, TimeProvider(base_time_source=lambda: NOW))
    assert isinstance(provider, DatabaseVCSAdapter)


async def test_get_vcs_provider_rejects_unknown_id(session: AsyncSession) -> None:
    with pytest.raises(ServiceError) as excinfo:
        get_vcs_provider(session, TimeProvider(base_time_source=lambda: NOW), service_id="nope")
    assert excinfo.value.status_code == 404
