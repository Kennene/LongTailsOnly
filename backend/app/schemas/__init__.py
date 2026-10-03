from pydantic import BaseModel

from app.schemas.activity import ActivityEventRead
from app.schemas.appeal import AppealCreate, AppealRead
from app.schemas.audit import AuditLogRead
from app.schemas.baseline import BaselineEntry
from app.schemas.decision import DecisionRequest, Extension
from app.schemas.lease import LeaseOverview, LeaseRead
from app.schemas.people import TeamRead, UserRead
from app.schemas.repository import RepositoryRead
from app.schemas.simulation import ClockRead, DemoResetResult, TimeTravelRequest

CONTRACT_REQUEST_MODELS: list[type[BaseModel]] = [AppealCreate, DecisionRequest, TimeTravelRequest]
CONTRACT_RESPONSE_MODELS: list[type[BaseModel]] = [
    TeamRead, UserRead, RepositoryRead, LeaseRead, LeaseOverview, ActivityEventRead,
    AppealRead, AuditLogRead, BaselineEntry, ClockRead, DemoResetResult,
]

__all__ = [
    "ActivityEventRead", "AppealCreate", "AppealRead", "AuditLogRead", "BaselineEntry",
    "ClockRead", "CONTRACT_REQUEST_MODELS", "CONTRACT_RESPONSE_MODELS", "DecisionRequest",
    "DemoResetResult", "Extension", "LeaseOverview", "LeaseRead", "RepositoryRead", "TeamRead",
    "TimeTravelRequest", "UserRead",
]
