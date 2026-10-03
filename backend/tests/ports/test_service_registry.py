from collections.abc import Iterator

import pytest

from app.ports.service_registry import (
    ServiceDescriptor,
    ServiceKind,
    all_services,
    register,
    reset_registry,
)


@pytest.fixture(autouse=True)
def _clear_extra_registrations() -> Iterator[None]:
    """`reset_registry()` clears only `_EXTRA`, so extra descriptors never leak between tests."""
    yield
    reset_registry()


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

    ids = [service.id for service in all_services()]

    assert ids == sorted(ids)


def test_reregistering_an_identical_descriptor_is_a_noop() -> None:
    descriptor = ServiceDescriptor("same", "Same", ServiceKind.VCS, (), True)

    register(descriptor)
    register(descriptor)

    assert [service.id for service in all_services()].count("same") == 1


def test_conflicting_descriptor_for_a_known_id_raises() -> None:
    register(ServiceDescriptor("dup", "One", ServiceKind.VCS, (), True))

    with pytest.raises(ValueError, match="dup"):
        register(ServiceDescriptor("dup", "Two", ServiceKind.VCS, (), True))


def test_builtin_descriptors_survive_a_reset() -> None:
    register(ServiceDescriptor("temp", "Temp", ServiceKind.VCS, (), True))

    reset_registry()
    ids = {service.id for service in all_services()}

    assert "temp" not in ids
    assert {"github", "demo-tracker"} <= ids
