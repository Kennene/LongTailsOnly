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
    granted_days_ago: int | None = None  # None → the shared LEASE_GRANTED_DAYS_AGO


def _push(*days: int) -> tuple[EventSpec, ...]:
    return tuple(EventSpec(ActionType.PUSH, d) for d in days)


def _review(*days: int) -> tuple[EventSpec, ...]:
    return tuple(EventSpec(ActionType.PR_REVIEW, d) for d in days)


def _comment(*days: int) -> tuple[EventSpec, ...]:
    return tuple(EventSpec(ActionType.ISSUE_COMMENT, d) for d in days)


def _lapsed(login: str, repo: str, days_ago: int, events: tuple[EventSpec, ...] = (),
            role: Role = Role.WRITE) -> LeaseSpec:
    """Dostęp po terminie: wygasł `days_ago` dni temu, więc nadano go `days_ago + LEASE_DURATION_DAYS` dni temu."""
    return LeaseSpec(login, repo, role, events, granted_days_ago=days_ago + LEASE_DURATION_DAYS)


def _kamil() -> list[LeaseSpec]:
    """Kamil: dwa repozytoria odnawiane codziennym pushem, resztę zapomniał — każdy dostęp w innym czasie.

    Liczby przy `_lapsed` to „ile dni temu minął termin ważności”. Rozrzut jest celowy: Pulpit liczy
    tylko wygaśnięcia z ostatnich 30 dni (`app/domain/lease_window.py::EXPIRED_WINDOW_DAYS`), więc
    `qa-automation` i `legacy-reports` muszą wypaść z licznika, żeby było widać, że okno filtruje.
    """
    return [
        LeaseSpec("kamil", "core-api", Role.WRITE, _push(1, 2, 3)),
        LeaseSpec("kamil", "auth-service", Role.WRITE, _push(1, 2, 3)),
        LeaseSpec("kamil", "payment-service", Role.WRITE, _push(25) + _review(2, 5)),  # scenario A
        _lapsed("kamil", "frontend-app", 2, _review(3) + _comment(8)),
        _lapsed("kamil", "notifications", 6, _review(3) + _comment(8)),
        _lapsed("kamil", "infra-terraform", 11),
        _lapsed("kamil", "mobile-app", 17),
        _lapsed("kamil", "data-pipeline", 23),
        _lapsed("kamil", "qa-automation", 34),
        _lapsed("kamil", "legacy-reports", 47),
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
