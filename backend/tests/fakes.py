from app.domain.enums import Role
from app.services.errors import LastAdminError
from app.services.last_admin_guard import REPO_MESSAGE


class RecordingVCS:
    """Fake VCSProvider: records calls instead of changing access; `blocked` logins hit Last Admin Protection."""

    def __init__(self, blocked: set[str] | None = None) -> None:
        self.calls: list[tuple[str, str, str]] = []
        self.removed: list[tuple[str, str]] = []
        self.blocked = blocked or set()

    async def set_permission(self, owner: str, repo: str, username: str, role: Role) -> None:
        self.calls.append((f"{owner}/{repo}", username, role.value))

    async def remove_collaborator(self, owner: str, repo: str, username: str) -> None:
        if username in self.blocked:
            raise LastAdminError(REPO_MESSAGE)
        self.removed.append((f"{owner}/{repo}", username))
