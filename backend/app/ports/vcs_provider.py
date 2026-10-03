from typing import Protocol

from app.domain.enums import Role


class VCSProvider(Protocol):
    """Port to the VCS provider (ADR 0014 §3). Access is granted only through it, never by writing leases directly.

    Removal goes through Last Admin Protection (step 3.4) and raises `LastAdminError` (HTTP 403).
    """

    async def set_permission(self, owner: str, repo: str, username: str, role: Role) -> None: ...

    async def remove_collaborator(self, owner: str, repo: str, username: str) -> None: ...
