from datetime import UTC, datetime


def iso_z(value: datetime) -> str:
    """GitHub-style UTC timestamp, e.g. 2026-10-03T12:00:00Z."""
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def jira_dt(value: datetime) -> str:
    """Jira-style timestamp, e.g. 2026-10-03T12:00:00.000+0000."""
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000+0000")
