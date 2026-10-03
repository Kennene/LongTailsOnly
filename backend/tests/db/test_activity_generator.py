from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.activity_generator import ActivityEventSpec, generate_activity_specs, persist_activity_specs
from app.db.demo_data import ensure_population
from app.db.demo_scenarios import DEV_LOGINS, QA_LOGINS, REPOS, TEAM_OF
from app.domain.github_events import EVENT_REQUIRED_PERMISSION, LEASE_RENEWING_EVENT_TYPES
from app.models import ActivityEvent, Lease

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def of(specs: list[ActivityEventSpec], **kw: object) -> list[ActivityEventSpec]:
    return [s for s in specs if all(getattr(s, k) == v for k, v in kw.items())]


def active_by_repo(specs: list[ActivityEventSpec], team: str, kinds: set[str] | None = None) -> dict[str, set[str]]:
    out: dict[str, set[str]] = defaultdict(set)
    for s in specs:
        if TEAM_OF[s.login] == team and s.age_days <= 30 and (kinds is None or s.action_type in kinds):
            out[s.repo].add(s.login)
    return out


def test_generation_is_deterministic() -> None:
    assert generate_activity_specs() == generate_activity_specs()
    other = generate_activity_specs(seed=7)
    assert other != generate_activity_specs()
    strip = lambda ss: sorted((s.login, s.repo, s.action_type, s.age_days) for s in ss)  # noqa: E731
    assert strip(other) == strip(generate_activity_specs())  # seed only jitters hours


def test_scenario_a_ages() -> None:
    kamil = of(generate_activity_specs(), login="dev-kamil", repo="payment-gw")
    pushes = [s.age_days for s in kamil if s.action_type == "PushEvent"]
    assert min(pushes) == 18
    assert sorted(s.age_days for s in kamil if s.action_type == "PullRequestReviewEvent") == [2, 6, 11]
    assert [s.age_days for s in kamil if s.action_type == "IssueCommentEvent"] == [4]
    assert of(generate_activity_specs(), login="dev-kamil", action_type="PushEvent", age_days=0) == []


def test_scenario_b_single_comment_age_27() -> None:
    marta = of(generate_activity_specs(), login="qa-marta")
    assert [(s.repo, s.action_type, s.age_days) for s in marta] == [("core-api", "IssueCommentEvent", 27)]


def test_scenario_c_and_d_have_no_events() -> None:
    specs = generate_activity_specs()
    assert of(specs, repo="legacy-reports") == []
    assert of(specs, login="dev-new") == []


def test_background_dev_push_ages_spread() -> None:
    newest: dict[str, int] = {}
    for s in of(generate_activity_specs(), action_type="PushEvent"):
        if s.login.startswith("dev-") and s.login not in {"dev-kamil", "dev-new"}:
            newest[s.login] = min(newest.get(s.login, 999), s.age_days)
    assert sorted(newest.values()) == [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
    assert newest["dev-01"] == 1 and newest["dev-10"] == 19


def test_baseline_counts_match_spec() -> None:
    dev = active_by_repo(generate_activity_specs(), "DEV")
    qa = active_by_repo(generate_activity_specs(), "QA")
    assert len(DEV_LOGINS) == 12 and len(QA_LOGINS) == 6
    assert {r: len(dev[r]) for r in dev} == {
        "core-api": 9, "auth-service": 8, "frontend-app": 8, "notifications": 6,
        "data-pipeline": 5, "mobile-app": 7, "payment-gw": 3,
    }
    assert {r: len(qa[r]) for r in qa} == {"frontend-app": 4, "core-api": 3, "auth-service": 2}


def test_baseline_repos_pushers_vs_reviewers() -> None:
    specs = generate_activity_specs()
    pushers = {s.repo for s in of(specs, action_type="PushEvent") if TEAM_OF[s.login] == "DEV"}
    assert "mobile-app" not in pushers  # read-only baseline repo
    assert {"core-api", "auth-service", "frontend-app", "notifications"} <= pushers
    assert not any(s.action_type == "PushEvent" for s in specs if TEAM_OF[s.login] == "QA")


def test_noise_events_do_not_change_baseline_membership() -> None:
    specs = generate_activity_specs()
    for team in ("DEV", "QA"):
        assert active_by_repo(specs, team) == active_by_repo(specs, team, set(LEASE_RENEWING_EVENT_TYPES))
    kinds = {s.action_type for s in specs}
    assert {"PullRequestEvent", "IssuesEvent", "PublicEvent"} <= kinds  # noise is actually generated


def test_admin_events() -> None:
    admin = of(generate_activity_specs(), login="tomasz-admin")
    assert {(s.repo, s.action_type) for s in admin} == {("infra-terraform", "PushEvent"), ("docs-site", "PublicEvent")}


def test_all_specs_have_known_types_and_ages_within_90_days() -> None:
    for s in generate_activity_specs():
        assert s.action_type in EVENT_REQUIRED_PERMISSION
        assert s.repo in REPOS and s.login in TEAM_OF
        assert 0 <= s.age_days <= 85 and 0 <= s.hour_offset < 12


async def test_persist_inserts_rows_with_required_permission_and_is_idempotent(session: AsyncSession) -> None:
    await ensure_population(session, "longtails")
    specs = generate_activity_specs()
    assert await persist_activity_specs(session, specs, NOW) == len(specs)
    assert await persist_activity_specs(session, specs, NOW) == 0
    assert await session.scalar(select(func.count()).select_from(ActivityEvent)) == len(specs)
    assert await session.scalar(select(func.count()).select_from(Lease)) == 0  # not record_activity: no side effects
    for event in (await session.scalars(select(ActivityEvent))).all():
        assert event.required_permission == EVENT_REQUIRED_PERMISSION[event.action_type]


async def test_persist_uses_injected_now(session: AsyncSession) -> None:
    await ensure_population(session, "longtails")
    spec = ActivityEventSpec("dev-01", "core-api", "PushEvent", age_days=5, hour_offset=3)
    await persist_activity_specs(session, [spec], NOW)
    event = (await session.scalars(select(ActivityEvent))).one()
    assert event.timestamp == NOW - timedelta(days=5, hours=3)
