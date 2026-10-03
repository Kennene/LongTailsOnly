from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field, model_validator


class TimeTravelRequest(BaseModel):
    """Exactly one of `days` (advance) or `reset`."""

    days: int | None = Field(default=None, ge=1, le=365)
    reset: bool = False

    @model_validator(mode="after")
    def exactly_one_action(self) -> Self:
        if (self.days is None) == (not self.reset):
            raise ValueError("provide either `days` or `reset: true`")
        return self


class SimulationClock(BaseModel):
    simulated_now: datetime
    offset_seconds: int
