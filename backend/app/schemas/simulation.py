from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.activity import ActivityEventRead
from app.schemas.people import UserRead


class ClockRead(BaseModel):
    now: datetime
    offset_days: int


class TimeTravelRequest(BaseModel):
    days: int = Field(ge=1, le=365)


class DemoResetResult(BaseModel):
    now: datetime
    offset_days: int
    counts: dict[str, int]


class DemoRefreshResult(BaseModel):
    """One demo "refresh": the first call finds a new person, every later one brings fresh activity instead."""

    added_users: list[UserRead]
    events: list[ActivityEventRead]


class SimulationClock(BaseModel):
    """Which demo day the panel is on: simulated UTC time and how many days we travelled (ADR 0003, ADR 0014 §4)."""

    simulated_now: datetime
    offset_days: int
