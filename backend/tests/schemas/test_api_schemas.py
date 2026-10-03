from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.domain.enums import DecisionAction, Role
from app.schemas import AppealCreate, BaselineEntry, DecisionRequest, LeaseRead, RepositoryRead

NOW = datetime(2026, 10, 3, tzinfo=UTC)
REPO = {"id": 1, "name": "core-api", "owner": "longtails", "default_branch": "main",
        "default_lease_duration_days": 30}
USER = {"id": 1, "login": "kamil", "name": "Kamil", "team": None, "is_admin": False}


def lease(**overrides: object) -> dict[str, object]:
    data: dict[str, object] = {"id": 1, "user": USER, "repository": REPO, "current_role": "write",
                               "granted_at": NOW, "expires_at": NOW, "is_active": True}
    return data | overrides


def test_lease_read_rejects_unknown_role() -> None:
    with pytest.raises(ValidationError):
        LeaseRead.model_validate(lease(current_role="maintain"))


def test_lease_read_reads_orm_like_objects() -> None:
    repo = RepositoryRead.model_validate(SimpleNamespace(**REPO))
    assert repo.name == "core-api"


def test_admin_lease_may_have_no_expiry() -> None:
    assert LeaseRead.model_validate(lease(current_role="admin", expires_at=None)).expires_at is None


@pytest.mark.parametrize("text", ["", "   "])
def test_appeal_requires_non_blank_justification(text: str) -> None:
    with pytest.raises(ValidationError):
        AppealCreate(lease_id=1, justification=text)


def test_appeal_justification_is_trimmed() -> None:
    assert AppealCreate(lease_id=1, justification="  Release v2.1  ").justification == "Release v2.1"


@pytest.mark.parametrize(
    "extension",
    [{"multiplier": 2.0}, {"preset_days": 14}, {"custom_days": 3}, {"until_date": date(2026, 12, 1)}],
)
def test_extend_accepts_exactly_one_option(extension: dict[str, object]) -> None:
    decision = DecisionRequest(action=DecisionAction.EXTEND, extension=extension)
    assert decision.extension is not None


@pytest.mark.parametrize(
    "payload",
    [
        {"action": "EXTEND"},
        {"action": "EXTEND", "extension": {}},
        {"action": "EXTEND", "extension": {"multiplier": 2.0, "preset_days": 7}},
        {"action": "EXTEND", "extension": {"multiplier": 3.0}},
        {"action": "EXTEND", "extension": {"preset_days": 5}},
        {"action": "EXTEND", "extension": {"custom_days": 0}},
        {"action": "REVOKE", "extension": {"preset_days": 7}},
        {"action": "PAUSE"},
    ],
)
def test_invalid_decisions_are_rejected(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        DecisionRequest.model_validate(payload)


def test_baseline_never_proposes_admin() -> None:
    with pytest.raises(ValidationError):
        BaselineEntry(team_id=1, repository=REPO, proposed_role=Role.ADMIN,
                      active_members=6, team_size=12)
