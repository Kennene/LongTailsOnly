from dataclasses import dataclass

from app.domain.enums import ActionType, Role

ADMIN_LOGIN = "tomasz-admin"
ADMIN_NAME = "Tomasz (IT Security)"
LEASE_DURATION_DAYS = 30
LEASE_GRANTED_DAYS_AGO = 90
ADMIN_GRANTED_DAYS_AGO = 365

TEAMS: list[tuple[str, str]] = [("dev", "DEV"), ("qa", "QA")]

REGULAR_DEVS: list[tuple[str, str]] = [
    ("ania", "Anna"), ("bartek", "Bartek"), ("celina", "Celina"), ("darek", "Darek"),
    ("ewa", "Ewa"), ("filip", "Filip"), ("gosia", "Gosia"), ("henryk", "Henryk"),
    ("iza", "Iza"), ("jan", "Jan"),
]
REGULAR_QA: list[tuple[str, str]] = [
    ("ola", "Ola"), ("piotr", "Piotr"), ("rafal", "Rafał"), ("sylwia", "Sylwia"), ("tomek", "Tomek"),
]
TEAM_MEMBERS: dict[str, list[tuple[str, str]]] = {
    "dev": [("kamil", "Kamil"), *REGULAR_DEVS, ("nowy-dev", "Nowy Developer")],
    "qa": [("marta", "Marta"), *REGULAR_QA],
}

REPOSITORIES: list[str] = [
    "core-api", "auth-service", "payment-service", "frontend-app", "infra-terraform",
    "notifications", "mobile-app", "data-pipeline", "qa-automation", "legacy-reports",
]
KAMIL_FORGOTTEN = ["infra-terraform", "mobile-app", "data-pipeline", "qa-automation", "legacy-reports"]


@dataclass(frozen=True)
class EventSpec:
    action: ActionType
    days_ago: int


@dataclass(frozen=True)
class LeaseSpec:
    login: str
    repo: str
    role: Role
    events: tuple[EventSpec, ...] = ()


def _push(*days: int) -> tuple[EventSpec, ...]:
    return tuple(EventSpec(ActionType.PUSH, d) for d in days)


def _review(*days: int) -> tuple[EventSpec, ...]:
    return tuple(EventSpec(ActionType.PR_REVIEW, d) for d in days)


def _comment(*days: int) -> tuple[EventSpec, ...]:
    return tuple(EventSpec(ActionType.ISSUE_COMMENT, d) for d in days)


def _kamil() -> list[LeaseSpec]:
    return [
        LeaseSpec("kamil", "core-api", Role.WRITE, _push(1, 2, 3)),
        LeaseSpec("kamil", "auth-service", Role.WRITE, _push(1, 2, 3)),
        LeaseSpec("kamil", "payment-service", Role.WRITE, _push(25) + _review(2, 5)),  # scenario A
        LeaseSpec("kamil", "frontend-app", Role.WRITE, _review(3) + _comment(8)),
        LeaseSpec("kamil", "notifications", Role.WRITE, _review(3) + _comment(8)),
        *(LeaseSpec("kamil", repo, Role.WRITE) for repo in KAMIL_FORGOTTEN),
    ]


def _marta() -> list[LeaseSpec]:
    return [
        LeaseSpec("marta", "qa-automation", Role.READ, _comment(27)),  # scenario B
        LeaseSpec("marta", "frontend-app", Role.READ, _comment(4)),
    ]


def _devs() -> list[LeaseSpec]:
    specs: list[LeaseSpec] = []
    for i, (login, _) in enumerate(REGULAR_DEVS):
        specs.append(LeaseSpec(login, "core-api", Role.WRITE, _push(i + 1) if i < 8 else _review(i)))
        if i < 6:
            specs.append(LeaseSpec(login, "auth-service", Role.WRITE, _push(i + 2)))
        if i < 3:
            specs.append(LeaseSpec(login, "frontend-app", Role.WRITE, _push(i + 1)))
        if i < 7:
            specs.append(LeaseSpec(login, "payment-service", Role.READ, _review(i + 3)))
    return specs


def _qa() -> list[LeaseSpec]:
    return [LeaseSpec(login, "qa-automation", Role.READ, _comment(i + 1))
            for i, (login, _) in enumerate(REGULAR_QA)]


def lease_specs() -> list[LeaseSpec]:
    return [*_kamil(), *_marta(), *_devs(), *_qa()]
