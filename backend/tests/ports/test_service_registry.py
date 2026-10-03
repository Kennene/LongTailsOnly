from collections.abc import Iterator

import pytest

from app.ports import service_registry
from app.ports.service_registry import (
    ServiceDescriptor,
    ServiceKind,
    all_services,
    register,
)


@pytest.fixture(autouse=True)
def _isolated_extras() -> Iterator[None]:
    """`_EXTRA` is module-global; clear it around every test so registrations cannot leak."""
    service_registry._EXTRA.clear()
    yield
    service_registry._EXTRA.clear()


def test_production_surface_exposes_no_test_only_helper() -> None:
    """Isolation clears `_EXTRA` directly, so no test-only mutator may reach production code."""
    assert not hasattr(service_registry, "reset_registry")


def test_register_then_all_services_returns_descriptor() -> None:
    descriptor = ServiceDescriptor(
        id="acme",
        name="Acme",
        kind=ServiceKind.VCS,
        capabilities=("dashboard",),
        is_available=True,
    )

    register(descriptor)

    assert descriptor in all_services()


def test_all_services_is_sorted_by_id() -> None:
    register(ServiceDescriptor("zeta", "Z", ServiceKind.VCS, (), True))
    register(ServiceDescriptor("alpha", "A", ServiceKind.VCS, (), True))

    assert [service.id for service in all_services()] == [
        "alpha",
        "demo-tracker",
        "github",
        "zeta",
    ]


def test_reregistering_an_identical_descriptor_is_a_noop() -> None:
    descriptor = ServiceDescriptor("same", "Same", ServiceKind.VCS, (), True)

    register(descriptor)
    register(descriptor)

    assert [service.id for service in all_services()].count("same") == 1


def test_reregistering_a_builtin_identical_descriptor_is_a_noop() -> None:
    """Task 2's adapters re-register these exact descriptors at import time.

    The idempotency guard must consult the merged catalog, not just `_EXTRA`, or
    importing an adapter raises `ValueError` and the whole app fails to start.
    """
    builtin = next(service for service in all_services() if service.id == "github")

    register(builtin)

    assert [service.id for service in all_services()].count("github") == 1


def test_conflicting_descriptor_for_a_builtin_id_raises() -> None:
    conflicting = ServiceDescriptor("github", "Not GitHub", ServiceKind.CLOUD_IAM, (), False)

    with pytest.raises(ValueError, match="github"):
        register(conflicting)


def test_conflicting_descriptor_for_a_known_id_raises() -> None:
    register(ServiceDescriptor("dup", "One", ServiceKind.VCS, (), True))

    with pytest.raises(ValueError, match="dup"):
        register(ServiceDescriptor("dup", "Two", ServiceKind.VCS, (), True))


def test_extra_registrations_survive_until_the_test_fixture_clears_them() -> None:
    register(ServiceDescriptor("temp", "Temp", ServiceKind.VCS, (), True))

    service_registry._EXTRA.clear()
    ids = {service.id for service in all_services()}

    assert "temp" not in ids
    assert {"github", "demo-tracker"} <= ids
