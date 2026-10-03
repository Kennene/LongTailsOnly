from datetime import datetime

from pydantic import BaseModel, Field


class ClockRead(BaseModel):
    now: datetime
    offset_days: int


class TimeTravelRequest(BaseModel):
    days: int = Field(ge=1, le=365)


class DemoResetResult(BaseModel):
    now: datetime
    offset_days: int
    counts: dict[str, int]


class SimulationClock(BaseModel):
    """Which demo day the panel is on: simulated UTC time and how many days we travelled (ADR 0003, ADR 0011 §4)."""

    simulated_now: datetime
    offset_days: int
