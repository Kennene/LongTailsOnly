from typing import Protocol

from app.domain.enums import Role


class VCSProvider(Protocol):
    """Port to the VCS provider (ADR 0011 §3). Access is granted only through it, never by writing leases directly.

    Persons 2 and 3 extend it with removal and Last Admin Protection (steps 2.3, 3.4).
    """

    async def set_permission(self, owner: str, repo: str, username: str, role: Role) -> None: ...
