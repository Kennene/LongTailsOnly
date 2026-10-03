import ast
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.database_vcs import DatabaseVCSAdapter
from app.api.v1.deps import get_vcs_provider
from app.core.time_provider import TimeProvider
from app.ports.service_registry import ServiceKind, all_services
from app.services.errors import ServiceError

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
ADAPTERS_DIR = Path(__file__).resolve().parents[2] / "app" / "adapters"


def top_level_register_calls(source: str) -> int:
    """Count module-level `register(...)` call statements in `source`, without importing it."""
    return sum(
        1
        for node in ast.parse(source).body
        if isinstance(node, ast.Expr)
        and isinstance(node.value, ast.Call)
        and isinstance(node.value.func, ast.Name)
        and node.value.func.id == "register"
    )


@pytest.mark.parametrize("module_name", ["database_vcs.py", "demo_service.py"])
def test_each_adapter_declares_its_descriptor_at_import(module_name: str) -> None:
    """Deleting an adapter's declaration changes nothing at runtime, so this test guards it.

    Both ids are also served from the registry's `_BUILTIN` tier, which makes the import-time
    registration a checked no-op: every other test here would still pass without it. Parsing
    the source is the only thing that notices the declaration going away.
    """
    source = (ADAPTERS_DIR / module_name).read_text(encoding="utf-8")
    assert top_level_register_calls(source) == 1


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
