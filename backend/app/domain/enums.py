from enum import StrEnum


class Role(StrEnum):
    READ = "read"
    WRITE = "write"
    ADMIN = "admin"


class GitHubPermission(StrEnum):
    PULL = "pull"
    TRIAGE = "triage"
    PUSH = "push"
    MAINTAIN = "maintain"
    ADMIN = "admin"


class ActionType(StrEnum):
    PUSH = "PushEvent"
    PR_REVIEW = "PullRequestReviewEvent"
    ISSUE_COMMENT = "IssueCommentEvent"
    # Mock-only activity (ADR 0010): visible in /events, never renews a lease.
    PR_MERGE = "PullRequestEvent"
    ISSUE_LABEL = "IssuesEvent"
    REPO_SETTINGS = "PublicEvent"


class LeaseStatus(StrEnum):
    ACTIVE = "ACTIVE"
    WARNING = "WARNING"
    EXPIRED = "EXPIRED"


class Recommendation(StrEnum):
    KEEP = "KEEP"
    DOWNSCOPE = "DOWNSCOPE"
    REVOKE = "REVOKE"


class AppealStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ActorType(StrEnum):
    ADMIN = "ADMIN"
    USER = "USER"
    SYSTEM = "SYSTEM"


class DecisionAction(StrEnum):
    EXTEND = "EXTEND"
    DOWNSCOPE = "DOWNSCOPE"
    REVOKE = "REVOKE"


class AuditAction(StrEnum):
    """What an audit_logs row records (ADR 0011 §2); the column stays text, writers must use this enum."""

    LEASE_EXTENDED = "LEASE_EXTENDED"
    LEASE_DOWNSCOPED = "LEASE_DOWNSCOPED"
    LEASE_REVOKED = "LEASE_REVOKED"
    APPEAL_SUBMITTED = "APPEAL_SUBMITTED"
    APPEAL_REJECTED = "APPEAL_REJECTED"
    BASELINE_APPLIED = "BASELINE_APPLIED"
    TIME_TRAVEL = "TIME_TRAVEL"
    LAST_ADMIN_BLOCKED = "LAST_ADMIN_BLOCKED"
    DEMO_RESET = "DEMO_RESET"
