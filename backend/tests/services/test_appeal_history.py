from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import AppealStatus, Role
from app.models import Appeal
from app.services.appeal_service import list_appeal_overviews, reject_appeal, submit_appeal
from app.services.errors import ServiceError
from tests.factories import make_lease, make_repo, make_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


async def history(session: AsyncSession) -> dict[str, Appeal]:
    marta = await make_user(session, "marta", team="qa")
    anna = await make_user(session, "ania")
    await make_user(session, "nowy-dev")
    qa = await make_repo(session, "qa-automation")
    frontend = await make_repo(session, "frontend-app")
    expiring = {"granted_at": NOW - timedelta(days=27), "expires_at": NOW + timedelta(days=3)}
    marta_qa = await make_lease(session, marta, qa, Role.READ, **expiring)
    marta_front = await make_lease(session, marta, frontend, Role.READ, **expiring)
    anna_qa = await make_lease(session, anna, qa, Role.WRITE, **expiring)
    first = await submit_appeal(session, lease_id=marta_qa.id, justification="Release v2.1", now=NOW)
    await reject_appeal(session, appeal_id=first.id, now=NOW, actor_id=1, justification="No")
    second = await submit_appeal(session, lease_id=marta_front.id, justification="Regression",
                                 now=NOW + timedelta(hours=1))
    other = await submit_appeal(session, lease_id=anna_qa.id, justification="Hotfix", now=NOW + timedelta(hours=2))
    third = await submit_appeal(session, lease_id=marta_qa.id, justification="Audit prep", now=NOW + timedelta(hours=3))
    return {"first": first, "second": second, "other": other, "third": third}


def ids(views: list) -> list[int]:
    return [view.id for view in views]


async def test_history_of_one_person_is_newest_first(session: AsyncSession) -> None:
    appeals = await history(session)

    views = await list_appeal_overviews(session, now=NOW + timedelta(hours=3), login="marta")

    assert ids(views) == [appeals["third"].id, appeals["second"].id, appeals["first"].id]
    assert [view.previous_appeals for view in views] == [2, 1, 0]
    assert {view.user.login for view in views} == {"marta"}


async def test_lease_and_status_filters_combine(session: AsyncSession) -> None:
    appeals = await history(session)
    lease_id = appeals["third"].lease_id

    pending = await list_appeal_overviews(session, now=NOW, lease_id=lease_id, status=AppealStatus.PENDING)
    rejected = await list_appeal_overviews(session, now=NOW, lease_id=lease_id, status=AppealStatus.REJECTED)

    assert (ids(pending), ids(rejected)) == ([appeals["third"].id], [appeals["first"].id])


async def test_without_filters_returns_everything(session: AsyncSession) -> None:
    await history(session)

    assert len(await list_appeal_overviews(session, now=NOW)) == 4


async def test_unknown_login_is_404_but_person_without_appeals_is_empty(session: AsyncSession) -> None:
    await history(session)

    with pytest.raises(ServiceError) as error:
        await list_appeal_overviews(session, now=NOW, login="martaa")

    assert (error.value.status_code, error.value.detail) == (404, "User martaa not found")
    assert await list_appeal_overviews(session, now=NOW, login="nowy-dev") == []
