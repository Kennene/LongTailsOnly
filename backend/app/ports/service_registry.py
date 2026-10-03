"""In-code registry of the external services this product can talk to.

`register()` and `all_services()` are the single public API of this module: an adapter
registers its own descriptor at import time and the API layer reads the catalog back.

This is deliberately a plain in-code catalog rather than `importlib.metadata.entry_points`
discovery — two adapters do not justify the abstraction (`CODING_STANDARDS.md` §1.5).
Swapping to entry-point discovery touches only this file.

Registering an `id` that is already known with a *different* descriptor raises
`ValueError` instead of silently overwriting the existing entry; re-registering an
identical descriptor is a no-op, so importing an adapter twice is harmless.

The catalog has two tiers. `_BUILTIN` holds the canonical descriptors for the services
the product ships with and is never cleared; `_EXTRA` holds runtime registrations.
`reset_registry()` drops only `_EXTRA`, so the built-ins survive it — a test reset
cannot leave `all_services()` empty for the rest of the session, because Python imports
this module (and every adapter that registers into it) only once.
"""

from dataclasses import dataclass
from enum import StrEnum


class ServiceKind(StrEnum):
    """The class of external system a service represents."""

    VCS = "vcs"
    ISSUE_TRACKER = "issue_tracker"
    CLOUD_IAM = "cloud_iam"


@dataclass(frozen=True, slots=True)
class ServiceDescriptor:
    """What the API and the UI need to know about one service."""

    id: str
    name: str
    kind: ServiceKind
    capabilities: tuple[str, ...]
    is_available: bool


_BUILTIN: tuple[ServiceDescriptor, ...] = (
    ServiceDescriptor(
        id="github",
        name="GitHub",
        kind=ServiceKind.VCS,
        capabilities=("dashboard", "leases", "appeals", "baseline", "graph", "audit"),
        is_available=True,
    ),
    ServiceDescriptor(
        id="demo-tracker",
        name="Demo Tracker (integracja demonstracyjna)",
        kind=ServiceKind.ISSUE_TRACKER,
        capabilities=("dashboard", "audit"),
        is_available=False,
    ),
)

_EXTRA: list[ServiceDescriptor] = []


def register(descriptor: ServiceDescriptor) -> None:
    """Add `descriptor` to the catalog.

    Idempotent for an identical descriptor; raises `ValueError` when the `id` is known
    but the descriptor differs.
    """
    for known in all_services():
        if known.id != descriptor.id:
            continue
        if known == descriptor:
            return
        raise ValueError(
            f"Service {descriptor.id!r} is already registered with a different descriptor"
        )
    _EXTRA.append(descriptor)


def all_services() -> tuple[ServiceDescriptor, ...]:
    """The catalog: built-ins merged with registered extras, de-duplicated by `id`, sorted by `id`."""
    by_id: dict[str, ServiceDescriptor] = {}
    for descriptor in (*_BUILTIN, *_EXTRA):
        by_id[descriptor.id] = descriptor
    return tuple(by_id[service_id] for service_id in sorted(by_id))


def reset_registry() -> None:
    """Drop runtime registrations. Test-only helper: the `_BUILTIN` tier is never cleared."""
    _EXTRA.clear()
