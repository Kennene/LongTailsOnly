from app.domain.enums import Role


class RecordingVCS:
    """Fake VCSProvider: records calls instead of changing access."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str]] = []

    async def set_permission(self, owner: str, repo: str, username: str, role: Role) -> None:
        self.calls.append((f"{owner}/{repo}", username, role.value))
