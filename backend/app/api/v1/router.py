"""API v1 router (ADR 0010 §1): each feature adds one include_router line here."""

from fastapi import APIRouter

from app.api.v1 import audit, baseline

v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(audit.router)
v1_router.include_router(baseline.router)
