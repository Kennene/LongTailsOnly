"""DTO of the service catalog served by `GET /api/v1/services`."""

from pydantic import BaseModel, ConfigDict

from app.ports.service_registry import ServiceDescriptor, ServiceKind


class ServiceRead(BaseModel):
    """One selectable external service: its identity, what it can do and whether it is usable."""

    # ServiceDescriptor is a frozen dataclass rather than an ORM model, so this DTO declares
    # `from_attributes` itself instead of reusing `ORMModel`; `model_validate` then accepts a
    # descriptor directly. Kept out of the docstring so it stays out of the published contract.
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    kind: ServiceKind
    capabilities: list[str]
    is_available: bool

    @classmethod
    def from_descriptor(cls, descriptor: ServiceDescriptor) -> ServiceRead:
        """Widen the registry's `tuple[str, ...]` capabilities into a sorted JSON array.

        `capabilities` is a set in everything but type: the frontend treats it as one and no
        consumer reads the order, so normalising it here removes a silent payload change class —
        reordering a registry tuple used to alter the response while every test stayed green.
        """
        return cls(
            id=descriptor.id,
            name=descriptor.name,
            kind=descriptor.kind,
            capabilities=sorted(descriptor.capabilities),
            is_available=descriptor.is_available,
        )
