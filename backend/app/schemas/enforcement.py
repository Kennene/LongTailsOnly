from pydantic import BaseModel

from app.domain.enums import EnforcementMode


class EnforcementModeRead(BaseModel):
    mode: EnforcementMode


class EnforcementModeUpdate(BaseModel):
    mode: EnforcementMode
