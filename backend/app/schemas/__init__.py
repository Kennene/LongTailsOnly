from pydantic import BaseModel

from app.schemas.activity import ActivityEventRead
from app.schemas.appeal import AppealCreate, AppealOverview, AppealRead, AppealRejectRequest
from app.schemas.audit import AuditEntry, AuditLogRead
from app.schemas.baseline import BaselineEntry, OnboardingProposal
from app.schemas.decision import DecisionRequest, Extension
from app.schemas.enforcement import EnforcementModeRead, EnforcementModeUpdate
from app.schemas.insights import DashboardStats, PermissionGraph
from app.schemas.lease import LeaseActivityStats, LeaseOverview, LeaseRead
from app.schemas.people import TeamRead, UserRead
from app.schemas.repository import RepositoryRead
from app.schemas.simulation import ClockRead, DemoResetResult, SimulationClock, TimeTravelRequest

CONTRACT_REQUEST_MODELS: list[type[BaseModel]] = [
    AppealCreate, DecisionRequest, TimeTravelRequest, AppealRejectRequest, EnforcementModeUpdate,
]
CONTRACT_RESPONSE_MODELS: list[type[BaseModel]] = [
    TeamRead, UserRead, RepositoryRead, LeaseRead, LeaseOverview, ActivityEventRead,
    AppealRead, AuditLogRead, BaselineEntry, ClockRead, DemoResetResult,
    AuditEntry, OnboardingProposal, AppealOverview, DashboardStats, PermissionGraph,
    SimulationClock, EnforcementModeRead, LeaseActivityStats,
]

__all__ = [
    "ActivityEventRead", "AppealCreate", "AppealOverview", "AppealRead", "AppealRejectRequest", "AuditEntry",
    "AuditLogRead", "BaselineEntry", "ClockRead", "CONTRACT_REQUEST_MODELS", "CONTRACT_RESPONSE_MODELS",
    "DashboardStats", "DecisionRequest", "DemoResetResult", "EnforcementModeRead", "EnforcementModeUpdate", "Extension", "LeaseActivityStats", "LeaseOverview", "LeaseRead",
    "OnboardingProposal", "PermissionGraph", "RepositoryRead", "SimulationClock", "TeamRead",
    "TimeTravelRequest", "UserRead",
]
