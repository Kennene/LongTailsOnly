from app.domain.enums import EnforcementMode


class EnforcementState:
    """Enforcement mode kept in process memory, like the clock offset (docs/3-silnik-dzierzawy §5)."""

    def __init__(self, mode: EnforcementMode = EnforcementMode.WARNING) -> None:
        self.mode = mode

    def reset(self) -> None:
        self.mode = EnforcementMode.WARNING


enforcement_state = EnforcementState()


def get_enforcement_state() -> EnforcementState:
    return enforcement_state
