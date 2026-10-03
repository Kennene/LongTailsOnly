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


class Provider(StrEnum):
    GITHUB = "github"
    JIRA = "jira"


class ActionType(StrEnum):
    PUSH = "PushEvent"
    PR_REVIEW = "PullRequestReviewEvent"
    ISSUE_COMMENT = "IssueCommentEvent"
    # Mock-only activity (ADR 0010): visible in /events, never renews a lease.
    PR_MERGE = "PullRequestEvent"
    ISSUE_LABEL = "IssuesEvent"
    REPO_SETTINGS = "PublicEvent"
    # Jira (ADR 0011): names follow Jira webhook events.
    JIRA_ISSUE_CREATED = "jira:issue_created"
    JIRA_ISSUE_UPDATED = "jira:issue_updated"
    JIRA_COMMENT_CREATED = "comment_created"
    JIRA_PROJECT_UPDATED = "project_updated"


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
