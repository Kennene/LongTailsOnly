"""Static demo data: roster, repositories and who is active where (PRODUKT.md UC-1..UC-5).

Scenarios (TTL 30 days, warning window 7 days):
  A  dev-kamil @ payment-gw: write, last push 18 days ago, still reviews -> down-scope to read
  B  qa-marta  @ core-api:   read, last comment 27 days ago -> warning, then revoke
  C  legacy-reports:         expired leases, zero activity
  D  dev-new:                brand-new developer, no access (team baseline onboarding)
Baseline (DEV = 12, QA = 6) is tuned so thresholds hold whether or not the newcomer is counted.
"""
ADMIN_LOGIN = "tomasz-admin"
ADMIN_TEAM = "IT"  # not a GitHub team: org owner / break-glass

DEV_LOGINS = ["dev-kamil", *[f"dev-{i:02d}" for i in range(1, 11)], "dev-new"]
QA_LOGINS = ["qa-marta", *[f"qa-{i:02d}" for i in range(1, 6)]]
TEAM_OF: dict[str, str] = {
    ADMIN_LOGIN: ADMIN_TEAM,
    **{login: "DEV" for login in DEV_LOGINS},
    **{login: "QA" for login in QA_LOGINS},
}

REPOS = [
    "core-api", "auth-service", "payment-gw", "frontend-app", "infra-terraform",
    "notifications", "data-pipeline", "mobile-app", "docs-site", "legacy-reports",
]

# Background developers dev-01..dev-10: newest push is 1, 3, 5, ... 19 days ago, in every repo they push to.
BACKGROUND_PUSH_AGE = {f"dev-{i:02d}": 2 * i - 1 for i in range(1, 11)}
# repo -> numbers (1..10) of background developers pushing there
PUSHERS: dict[str, range | list[int]] = {
    "core-api": range(1, 10),       # 9/12 push -> baseline write
    "auth-service": range(2, 10),   # 8/12
    "frontend-app": range(3, 11),   # 8/12
    "notifications": range(4, 10),  # 6/12 == exactly 50% (6/11 also >= 50%)
    "data-pipeline": range(6, 11),  # 5/12 = 41.7% (5/11 = 45%): below threshold either way
    "payment-gw": [1, 2],           # plus dev-kamil -> 3/12
}
MOBILE_APP_REVIEWERS = range(1, 8)  # 7/12 review/comment only -> baseline read
MERGERS = {"core-api": [1, 2]}      # noise: merges by developers who already push there

# QA (6): repo -> {login: (action_type, age_days)}
QA_ACTIVITY: dict[str, dict[str, tuple[str, int]]] = {
    "frontend-app": {  # 4/6 -> read
        "qa-01": ("IssueCommentEvent", 3), "qa-02": ("PullRequestReviewEvent", 4),
        "qa-03": ("IssueCommentEvent", 6), "qa-04": ("PullRequestReviewEvent", 8),
    },
    "core-api": {  # 3/6 == exactly 50% (incl. scenario B)
        "qa-marta": ("IssueCommentEvent", 27), "qa-01": ("IssueCommentEvent", 4),
        "qa-02": ("PullRequestReviewEvent", 9),
    },
    "auth-service": {  # 2/6 -> below threshold
        "qa-04": ("IssueCommentEvent", 7), "qa-05": ("IssueCommentEvent", 12),
    },
}
QA_LABELERS = {"frontend-app": {"qa-01": 5, "qa-02": 6}}  # noise: labels by already-active QA

EXPIRED_LEGACY_LEASES = {"dev-01": "write", "qa-01": "read"}  # scenario C
