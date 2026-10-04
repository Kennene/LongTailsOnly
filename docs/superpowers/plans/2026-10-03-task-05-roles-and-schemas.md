# Zadanie 5: Role, mapowanie GitHuba i schematy API — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecany) lub `superpowers:executing-plans`. Kroki używają checkboxów (`- [ ]`).

**Cel:** Ranking ról MVP (`admin > write > read`), mapowanie na poziomy GitHub API oraz schematy Pydantic v2 dla API v1 i mocka GitHuba.

**Architektura:** `app/domain/roles.py` to czyste funkcje. `app/schemas/api.py` zawiera DTO z ADR 0006 §7, a `app/schemas/github.py` — kształty odpowiedzi GitHub REST API (ADR 0004). Schematy nie importują modeli ORM, więc zadanie zależy tylko od Zadania 1.

**Stack:** Pydantic v2.

**Spec:** ADR 0002, ADR 0004, ADR 0006 §4, §7; plan główny — Zadanie 5 (hierarchia 5-stopniowa z planu głównego jest nieaktualna; obowiązuje ADR 0002).

**Branch:** `feat/task-05-roles-and-schemas` · **Zależności:** 1 · **Odblokowuje:** 6, 7, 8, 9, 10, 11

## Ograniczenia globalne

- Hierarchia dostępów: `write > read`; `admin` stały (ADR 0002).
- Mapowanie GitHub → MVP: `pull`, `triage` → `read`; `push`, `maintain` → `write`; `admin` → `admin`.
- DTO dokładnie jak w ADR 0006 §7 — z tych samych nazw korzysta frontend (Zadanie 12).
- Pydantic v2: `model_config = ConfigDict(from_attributes=True)` (`CODING_STANDARDS.md`).

## Review Focus

- **Białe znaki w uzasadnieniu:** `"   "` musi zostać odrzucone (tarcie z ADR 0005) → test `test_justification_is_stripped_and_required`.
- **Przedłużenie bez długości / z dwiema długościami:** `EXTEND` wymaga dokładnie jednego z `multiplier`/`days`/`until` → test `test_extend_requires_exactly_one_duration`.
- **`REJECT` na dostępie:** dozwolony tylko dla odwołań → test `test_lease_decision_rejects_reject_action`.
- **Naiwna data w `until`:** dopuszczamy tylko daty ze strefą (`AwareDatetime`) → test `test_until_requires_timezone`.
- **Format `created_at` GitHuba:** `"...Z"`, a nie `"+00:00"` → test `test_github_event_serializes_created_at_with_z`.

---

### Krok 1: `roles.py`

**Pliki:**
- Utwórz: `backend/app/domain/roles.py`
- Test: `backend/tests/domain/test_roles.py`

**Interfejsy:**
- Produkuje: `rank(permission) -> int`, `covers(event_permission, lease_role) -> bool`, `from_github_permission(value: str) -> Permission`, `github_permissions(role) -> dict[str, bool]`, `github_role_name(role) -> str`.

- [ ] **1.1: Napisz testy** `backend/tests/domain/test_roles.py`:

```python
import pytest

from app.domain.enums import Permission
from app.domain.roles import covers, from_github_permission, github_permissions, github_role_name, rank


def test_role_order_and_write_read_mapping() -> None:
    assert rank(Permission.ADMIN) > rank(Permission.WRITE) > rank(Permission.READ)
    assert from_github_permission("push") is Permission.WRITE
    assert from_github_permission("maintain") is Permission.WRITE
    assert from_github_permission("triage") is Permission.READ
    assert from_github_permission("pull") is Permission.READ
    assert from_github_permission("admin") is Permission.ADMIN


def test_write_activity_covers_read_but_not_vice_versa() -> None:
    assert covers(Permission.WRITE, Permission.WRITE)
    assert covers(Permission.WRITE, Permission.READ)
    assert covers(Permission.READ, Permission.READ)
    assert not covers(Permission.READ, Permission.WRITE)


def test_from_github_permission_rejects_unknown() -> None:
    with pytest.raises(ValueError):
        from_github_permission("owner")


def test_github_permission_flags_per_role() -> None:
    assert github_permissions(Permission.ADMIN) == {
        "admin": True, "maintain": True, "push": True, "triage": True, "pull": True,
    }
    assert github_permissions(Permission.WRITE) == {
        "admin": False, "maintain": False, "push": True, "triage": True, "pull": True,
    }
    assert github_permissions(Permission.READ) == {
        "admin": False, "maintain": False, "push": False, "triage": False, "pull": True,
    }
    assert [github_role_name(role) for role in Permission] == ["admin", "write", "read"]
```

- [ ] **1.2: Uruchom — RED.** Z `backend/`: `pytest tests/domain/test_roles.py -q` → `ModuleNotFoundError`.

- [ ] **1.3: Zaimplementuj** `backend/app/domain/roles.py`:

```python
"""Hierarchia ról MVP (ADR 0002) i mapowanie na poziomy GitHub REST API (ADR 0004)."""

from app.domain.enums import Permission

_RANK = {Permission.READ: 1, Permission.WRITE: 2, Permission.ADMIN: 3}

_FROM_GITHUB = {
    "pull": Permission.READ,
    "triage": Permission.READ,
    "push": Permission.WRITE,
    "maintain": Permission.WRITE,
    "admin": Permission.ADMIN,
}

_GITHUB_FLAGS = {
    Permission.ADMIN: {"admin": True, "maintain": True, "push": True, "triage": True, "pull": True},
    Permission.WRITE: {"admin": False, "maintain": False, "push": True, "triage": True, "pull": True},
    Permission.READ: {"admin": False, "maintain": False, "push": False, "triage": False, "pull": True},
}


def rank(permission: Permission) -> int:
    return _RANK[permission]


def covers(event_permission: Permission, lease_role: Permission) -> bool:
    """Czy aktywność o danym poziomie potwierdza (odnawia) rolę dostępu."""
    return rank(event_permission) >= rank(lease_role)


def from_github_permission(value: str) -> Permission:
    try:
        return _FROM_GITHUB[value]
    except KeyError:
        raise ValueError(f"Unsupported GitHub permission: {value}") from None


def github_permissions(role: Permission) -> dict[str, bool]:
    return dict(_GITHUB_FLAGS[role])


def github_role_name(role: Permission) -> str:
    return role.value
```

- [ ] **1.4: Uruchom — GREEN.** `pytest tests/domain/test_roles.py -q` → `4 passed`.

- [ ] **1.5: Commit.** `git add backend/app/domain/roles.py backend/tests/domain/test_roles.py && git commit -m "feat(domain): add MVP role ranking and GitHub mapping"`

---

### Krok 2: DTO API v1 (`schemas/api.py`)

**Pliki:**
- Utwórz: `backend/app/schemas/__init__.py`, `backend/app/schemas/api.py`, `backend/tests/schemas/__init__.py`
- Test: `backend/tests/schemas/test_api_schemas.py`

**Interfejsy:**
- Produkuje: `ClockView`, `TimeTravelRequest`, `PolicyView`, `PolicyUpdate`, `UserRef`, `RepoRef`, `UserView`, `LeaseView`, `LeaseDecisionRequest`, `AppealCreate`, `AppealDecisionRequest`, `AppealView`, `BaselineEntryView`, `BaselineView`, `BaselineApplyRequest`, `AuditLogView`.

- [ ] **2.1: Napisz testy** `backend/tests/schemas/test_api_schemas.py`:

```python
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.domain.enums import DecisionAction, LeaseStatus, Permission, Recommendation
from app.schemas.api import (
    AppealDecisionRequest,
    AppealView,
    LeaseDecisionRequest,
    LeaseView,
    RepoRef,
    TimeTravelRequest,
    UserRef,
)

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
USER = UserRef(id=1, login="kamil-dev", name="Kamil", team="DEV")
REPO = RepoRef(id=1, name="core-api", owner="longtails")


def lease_payload(**overrides: object) -> dict[str, object]:
    return {
        "id": 1, "user": USER, "repo": REPO, "role": "write", "granted_at": NOW, "expires_at": NOW,
        "days_remaining": 0, "status": "EXPIRED", "recommendation": "REVOKE",
        "last_activity_at": None, "last_activity_type": None, **overrides,
    }


def test_api_schemas_reject_invalid_role_and_status() -> None:
    lease = LeaseView(**lease_payload())
    assert lease.role is Permission.WRITE
    assert lease.status is LeaseStatus.EXPIRED
    assert lease.recommendation is Recommendation.REVOKE

    with pytest.raises(ValidationError):
        LeaseView(**lease_payload(role="maintain"))
    with pytest.raises(ValidationError):
        LeaseView(**lease_payload(status="OPEN"))
    with pytest.raises(ValidationError):
        AppealView(
            id=1, lease_id=1, user=USER, repo=REPO, requested_role="write", justification="x", status="OPEN",
            created_at=NOW, resolved_at=None, lease_status="WARNING", days_remaining=3,
            recent_activity_count=0, previous_appeals=0,
        )


def test_justification_is_stripped_and_required() -> None:
    decision = LeaseDecisionRequest(action="REVOKE", justification="  unused repo  ")
    assert decision.justification == "unused repo"

    with pytest.raises(ValidationError):
        LeaseDecisionRequest(action="REVOKE", justification="   ")


def test_extend_requires_exactly_one_duration() -> None:
    assert LeaseDecisionRequest(action="EXTEND", days=14, justification="sprint").days == 14
    assert LeaseDecisionRequest(action="EXTEND", multiplier=2, justification="release").multiplier == 2

    with pytest.raises(ValidationError):
        LeaseDecisionRequest(action="EXTEND", justification="no duration")
    with pytest.raises(ValidationError):
        LeaseDecisionRequest(action="EXTEND", days=7, multiplier=2, justification="two durations")
    with pytest.raises(ValidationError):
        LeaseDecisionRequest(action="REVOKE", days=7, justification="duration on revoke")
    with pytest.raises(ValidationError):
        LeaseDecisionRequest(action="EXTEND", multiplier=1, justification="multiplier must exceed 1")


def test_lease_decision_rejects_reject_action() -> None:
    with pytest.raises(ValidationError):
        LeaseDecisionRequest(action="REJECT", justification="not for leases")

    assert AppealDecisionRequest(action="REJECT", justification="no business need").action is DecisionAction.REJECT


def test_until_requires_timezone() -> None:
    with pytest.raises(ValidationError):
        LeaseDecisionRequest(action="EXTEND", until=datetime(2026, 12, 1), justification="naive")


def test_time_travel_request_defaults() -> None:
    request = TimeTravelRequest()

    assert request.days == 0
    assert request.reset is False
```

- [ ] **2.2: Uruchom — RED.** `pytest tests/schemas/test_api_schemas.py -q` → `ModuleNotFoundError`.

- [ ] **2.3: Zaimplementuj** `backend/app/schemas/api.py` (oraz puste `app/schemas/__init__.py`, `tests/schemas/__init__.py`):

```python
"""DTO API v1 — kontrakt z ADR 0006 §7 (lustrzane typy: frontend/src/types/api.ts)."""

from datetime import datetime
from typing import Annotated, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.domain.enums import (
    ActionType,
    ActorType,
    AppealStatus,
    AuditAction,
    DecisionAction,
    EnforcementMode,
    LeaseStatus,
    Permission,
    Recommendation,
    Team,
)

Justification = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ClockView(ApiModel):
    now: datetime
    offset_days: int


class TimeTravelRequest(ApiModel):
    days: int = Field(default=0, ge=-365, le=365)
    reset: bool = False


class PolicyView(ApiModel):
    mode: EnforcementMode
    lease_days: int
    warning_days: int


class PolicyUpdate(ApiModel):
    mode: EnforcementMode


class UserRef(ApiModel):
    id: int
    login: str
    name: str
    team: Team | None


class RepoRef(ApiModel):
    id: int
    name: str
    owner: str


class UserView(UserRef):
    is_admin: bool
    active_lease_count: int


class LeaseView(ApiModel):
    id: int
    user: UserRef
    repo: RepoRef
    role: Permission
    granted_at: datetime
    expires_at: datetime | None
    days_remaining: int | None
    status: LeaseStatus
    recommendation: Recommendation
    last_activity_at: datetime | None
    last_activity_type: ActionType | None


class _Decision(ApiModel):
    action: DecisionAction
    multiplier: float | None = Field(default=None, gt=1, le=4)
    days: int | None = Field(default=None, ge=1, le=365)
    until: AwareDatetime | None = None
    justification: Justification

    @model_validator(mode="after")
    def _check_duration(self) -> Self:
        durations = [value for value in (self.multiplier, self.days, self.until) if value is not None]
        if self.action is DecisionAction.EXTEND and len(durations) != 1:
            raise ValueError("EXTEND requires exactly one of: multiplier, days, until")
        if self.action is not DecisionAction.EXTEND and durations:
            raise ValueError("Only EXTEND accepts a duration")
        return self


class LeaseDecisionRequest(_Decision):
    @model_validator(mode="after")
    def _reject_is_appeal_only(self) -> Self:
        if self.action is DecisionAction.REJECT:
            raise ValueError("REJECT applies only to appeals")
        return self


class AppealDecisionRequest(_Decision):
    pass


class AppealCreate(ApiModel):
    lease_id: int
    justification: Justification


class AppealView(ApiModel):
    id: int
    lease_id: int
    user: UserRef
    repo: RepoRef
    requested_role: Permission
    justification: str
    status: AppealStatus
    created_at: datetime
    resolved_at: datetime | None
    lease_status: LeaseStatus
    days_remaining: int | None
    recent_activity_count: int
    previous_appeals: int


class BaselineEntryView(ApiModel):
    repo: RepoRef
    active_members: int
    proposed_role: Permission


class BaselineView(ApiModel):
    team: Team
    member_count: int
    window_days: int
    entries: list[BaselineEntryView]


class BaselineApplyRequest(ApiModel):
    login: str = Field(min_length=1)


class AuditLogView(ApiModel):
    id: int
    timestamp: datetime
    actor_type: ActorType
    actor_id: str | None
    action: AuditAction
    target: str
    details: str | None
    justification: str | None
```

- [ ] **2.4: Uruchom — GREEN.** `pytest tests/schemas/test_api_schemas.py -q` → `6 passed`.

- [ ] **2.5: Commit.** `git add backend/app/schemas backend/tests/schemas && git commit -m "feat(schemas): add API v1 DTOs"`

---

### Krok 3: Schematy GitHub REST API (`schemas/github.py`)

**Pliki:**
- Utwórz: `backend/app/schemas/github.py`
- Test: `backend/tests/schemas/test_github_schemas.py`

**Interfejsy:**
- Produkuje: `GitHubSimpleUser`, `GitHubCollaborator`, `GitHubEventActor`, `GitHubEventRepo`, `GitHubEvent`, `GitHubError`, `GitHubInvitation`, `PutCollaboratorRequest`, `simple_user(login, user_id, base_url) -> GitHubSimpleUser`.

- [ ] **3.1: Zweryfikuj kształty w dokumentacji GitHuba** (ADR 0004 wymaga zgodności): „List repository collaborators”, „Add a repository collaborator”, „List repository events”, „List organization members”, „GitHub event types” na `docs.github.com/rest`. Jeśli dokumentacja ma pola, których brakuje w kodzie z kroku 3.3, dopisz je do schematów i testów.

- [ ] **3.2: Napisz testy** `backend/tests/schemas/test_github_schemas.py`:

```python
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.github import (
    GitHubCollaborator,
    GitHubEvent,
    GitHubEventActor,
    GitHubEventRepo,
    PutCollaboratorRequest,
    simple_user,
)

BASE = "http://localhost:8000/api/v3"


def test_simple_user_has_official_fields() -> None:
    user = simple_user("kamil-dev", 7, BASE).model_dump()

    assert user["login"] == "kamil-dev"
    assert user["id"] == 7
    assert user["url"] == f"{BASE}/users/kamil-dev"
    assert user["type"] == "User"
    assert user["site_admin"] is False
    assert {"node_id", "avatar_url", "html_url", "repos_url", "events_url"} <= user.keys()


def test_collaborator_includes_permissions_and_role_name() -> None:
    collaborator = GitHubCollaborator(
        **simple_user("anna-dev", 2, BASE).model_dump(),
        permissions={"admin": False, "maintain": False, "push": True, "triage": True, "pull": True},
        role_name="write",
    )

    assert collaborator.model_dump()["role_name"] == "write"


def test_put_collaborator_permission_defaults_to_push_and_rejects_unknown() -> None:
    assert PutCollaboratorRequest().permission == "push"

    with pytest.raises(ValidationError):
        PutCollaboratorRequest(permission="owner")


def test_github_event_serializes_created_at_with_z() -> None:
    event = GitHubEvent(
        id="42",
        type="PushEvent",
        actor=GitHubEventActor(id=7, login="kamil-dev", display_login="kamil-dev", url=f"{BASE}/users/kamil-dev",
                               avatar_url="https://avatars.example/u/7"),
        repo=GitHubEventRepo(id=1, name="longtails/core-api", url=f"{BASE}/repos/longtails/core-api"),
        payload={"ref": "refs/heads/main"},
        created_at=datetime(2026, 10, 3, 12, 0, tzinfo=UTC),
    )

    assert event.model_dump(mode="json")["created_at"] == "2026-10-03T12:00:00Z"
    assert event.public is True
```

- [ ] **3.3: Zaimplementuj** `backend/app/schemas/github.py`:

```python
"""Kształty odpowiedzi GitHub REST API v3 używane przez mock (ADR 0004)."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, field_serializer

GitHubPermissionName = Literal["pull", "triage", "push", "maintain", "admin"]


class GitHubSimpleUser(BaseModel):
    login: str
    id: int
    node_id: str
    avatar_url: str
    gravatar_id: str = ""
    url: str
    html_url: str
    followers_url: str
    following_url: str
    gists_url: str
    starred_url: str
    subscriptions_url: str
    organizations_url: str
    repos_url: str
    events_url: str
    received_events_url: str
    type: str = "User"
    site_admin: bool = False


class GitHubCollaborator(GitHubSimpleUser):
    permissions: dict[str, bool]
    role_name: str


class GitHubEventActor(BaseModel):
    id: int
    login: str
    display_login: str
    gravatar_id: str = ""
    url: str
    avatar_url: str


class GitHubEventRepo(BaseModel):
    id: int
    name: str
    url: str


class GitHubEvent(BaseModel):
    id: str
    type: str
    actor: GitHubEventActor
    repo: GitHubEventRepo
    payload: dict[str, Any]
    public: bool = True
    created_at: datetime

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime) -> str:
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")


class GitHubError(BaseModel):
    message: str
    documentation_url: str


class GitHubInvitation(BaseModel):
    id: int
    invitee: GitHubSimpleUser
    inviter: GitHubSimpleUser
    permissions: str
    url: str
    html_url: str


class PutCollaboratorRequest(BaseModel):
    permission: GitHubPermissionName = "push"


def simple_user(login: str, user_id: int, base_url: str) -> GitHubSimpleUser:
    user_url = f"{base_url}/users/{login}"
    return GitHubSimpleUser(
        login=login,
        id=user_id,
        node_id=f"U_mock{user_id}",
        avatar_url=f"https://avatars.githubusercontent.com/u/{user_id}?v=4",
        url=user_url,
        html_url=f"https://github.com/{login}",
        followers_url=f"{user_url}/followers",
        following_url=f"{user_url}/following{{/other_user}}",
        gists_url=f"{user_url}/gists{{/gist_id}}",
        starred_url=f"{user_url}/starred{{/owner}}{{/repo}}",
        subscriptions_url=f"{user_url}/subscriptions",
        organizations_url=f"{user_url}/orgs",
        repos_url=f"{user_url}/repos",
        events_url=f"{user_url}/events{{/privacy}}",
        received_events_url=f"{user_url}/received_events",
    )
```

- [ ] **3.4: Uruchom — GREEN.** `pytest tests/schemas -q` → `10 passed`.

- [ ] **3.5: Commit.** `git add backend/app/schemas/github.py backend/tests/schemas/test_github_schemas.py && git commit -m "feat(schemas): add GitHub REST API response shapes"`

---

### Krok 4: Weryfikacja

- [ ] **4.1:** Z `backend/`: `pytest -q && ruff check . && ruff format --check .` → zielone.
- [ ] **4.2:** PR → `main`. W opisie wskaż, że frontend (Zadanie 12) odwzorowuje `schemas/api.py` w `src/types/api.ts`.
