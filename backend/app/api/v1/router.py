"""API v1 router (ADR 0014 §1): each feature adds one include_router line here."""

from fastapi import APIRouter

from app.api.v1 import appeals, audit, baseline, enforcement, leases, onboarding

v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(audit.router)
v1_router.include_router(baseline.router)
v1_router.include_router(onboarding.router)
v1_router.include_router(appeals.router)
v1_router.include_router(enforcement.router)
v1_router.include_router(leases.router)
