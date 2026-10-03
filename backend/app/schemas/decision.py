from datetime import date
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator

from app.domain.enums import DecisionAction


class Extension(BaseModel):
    """Exactly one way of extending a lease (ADR 0005)."""

    multiplier: Literal[1.5, 2.0] | None = None
    preset_days: Literal[7, 14, 30, 90] | None = None
    custom_days: int | None = Field(default=None, gt=0, le=365)
    until_date: date | None = None

    @model_validator(mode="after")
    def exactly_one_option(self) -> Self:
        chosen = [v for v in (self.multiplier, self.preset_days, self.custom_days, self.until_date)
                  if v is not None]
        if len(chosen) != 1:
            raise ValueError("Choose exactly one extension option")
        return self


class DecisionRequest(BaseModel):
    action: DecisionAction
    extension: Extension | None = None
    justification: str | None = None

    @model_validator(mode="after")
    def extension_only_for_extend(self) -> Self:
        if self.action is DecisionAction.EXTEND and self.extension is None:
            raise ValueError("EXTEND requires an extension")
        if self.action is not DecisionAction.EXTEND and self.extension is not None:
            raise ValueError("Only EXTEND accepts an extension")
        return self
