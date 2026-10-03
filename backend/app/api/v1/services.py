"""Service catalog endpoint (service picker: the UI lists what the product can talk to)."""

from fastapi import APIRouter

from app.ports.service_registry import all_services
from app.schemas.service import ServiceRead

router = APIRouter(prefix="/services", tags=["services"])


@router.get("", response_model=list[ServiceRead])
async def list_services() -> list[ServiceRead]:
    """The whole catalog, sorted by `id`, with each service's kind, capabilities and availability."""
    return [ServiceRead.from_descriptor(descriptor) for descriptor in all_services()]
