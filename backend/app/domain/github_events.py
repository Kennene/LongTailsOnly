"""GitHub Events API payloads for the mock.

Whether an action renews a lease is decided in `app.domain.roles` (ADR 0002, ADR 0010).
Stored `PullRequestEvent` rows are always merges and `IssuesEvent` rows are always `labeled`.
"""
import hashlib
from typing import Any

from app.domain.enums import ActionType
from app.models import ActivityEvent, Repository, User
from app.utils.dates import iso_z

_LABELS = [("bug", "d73a4a"), ("enhancement", "a2eeef"), ("needs-triage", "fbca04")]
_REVIEW_STATES = ["approved", "commented", "changes_requested"]


def _sha(event_id: int, salt: str) -> str:
    return hashlib.sha1(f"{event_id}:{salt}".encode()).hexdigest()


def _actor(user: User) -> dict[str, Any]:
    return {"login": user.login, "id": user.id}


def build_event_payload(event: ActivityEvent, repo: Repository, user: User) -> dict[str, Any]:
    """Deterministic GitHub-shaped payload derived from the stored row (nothing else is persisted)."""
    eid = event.id
    number = 100 + eid % 900
    match event.action_type:
        case ActionType.PUSH:
            size = 1 + eid % 3
            shas = [_sha(eid, f"commit{i}") for i in range(size - 1)] + [_sha(eid, "head")]
            email = f"{user.login}@users.noreply.github.com"
            return {
                "repository_id": repo.id, "push_id": 10_000_000 + eid, "size": size, "distinct_size": size,
                "ref": f"refs/heads/{repo.default_branch}", "head": shas[-1], "before": _sha(eid, "before"),
                "commits": [
                    {"sha": s, "author": {"name": user.name, "email": email}, "message": f"Update {repo.name} #{eid}",
                     "distinct": True, "url": f"/repos/{repo.owner}/{repo.name}/commits/{s}"}
                    for s in shas
                ],
            }
        case ActionType.PR_MERGE:
            return {
                "action": "closed", "number": number,
                "pull_request": {
                    "id": 5_000_000 + eid, "number": number, "state": "closed", "title": f"Change #{number}",
                    "merged": True, "merged_at": iso_z(event.timestamp), "user": _actor(user),
                    "base": {"ref": repo.default_branch}, "head": {"ref": f"feature/{number}"},
                },
            }
        case ActionType.PR_REVIEW:
            return {
                "action": "created",
                "review": {"id": 6_000_000 + eid, "user": _actor(user), "state": _REVIEW_STATES[eid % 3],
                           "submitted_at": iso_z(event.timestamp), "body": ""},
                "pull_request": {"number": number, "state": "open", "title": f"Change #{number}"},
            }
        case ActionType.ISSUE_COMMENT:
            return {
                "action": "created",
                "issue": {"number": number, "state": "open", "title": f"Issue #{number}"},
                "comment": {"id": 7_000_000 + eid, "user": _actor(user), "body": f"Comment {eid}",
                            "created_at": iso_z(event.timestamp)},
            }
        case ActionType.ISSUE_LABEL:
            name, color = _LABELS[eid % len(_LABELS)]
            return {
                "action": "labeled",
                "issue": {"number": number, "state": "open", "title": f"Issue #{number}"},
                "label": {"name": name, "color": color},
            }
        case _:
            return {}
