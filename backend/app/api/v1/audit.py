from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import AwareDatetime

from app.api.v1.deps import SessionDep
from app.domain.enums import ActorType, AuditAction
from app.schemas.audit import AuditEntry
from app.services.audit_service import DEFAULT_AUDIT_LIMIT, list_audit_entries

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditEntry])
async def list_audit(
    session: SessionDep,
    actor_type: ActorType | None = None,
    action: AuditAction | None = None,
    actor_login: str | None = None,
    target: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
    since: AwareDatetime | None = None,
    until: AwareDatetime | None = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = DEFAULT_AUDIT_LIMIT,
) -> list[AuditEntry]:
    return await list_audit_entries(session, actor_type=actor_type, action=action, actor_login=actor_login,
                                    target=target, since=since, until=until, limit=limit)
