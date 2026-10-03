from app.db.seed_data import ADMIN_LOGIN, REPOSITORIES, TEAM_MEMBERS, lease_specs
from app.domain.enums import Role


def test_population_size_matches_product_spec() -> None:
    members = [login for people in TEAM_MEMBERS.values() for login, _ in people]
    assert len(TEAM_MEMBERS["dev"]) == 12 and len(TEAM_MEMBERS["qa"]) == 6
    assert 15 <= len(members) + 1 <= 25
    assert len(set(members)) == len(members) and ADMIN_LOGIN not in members
    assert 10 <= len(REPOSITORIES) <= 15


def test_specs_reference_known_people_and_repos() -> None:
    logins = {login for people in TEAM_MEMBERS.values() for login, _ in people}
    for spec in lease_specs():
        assert spec.login in logins and spec.repo in REPOSITORIES
        assert spec.role is not Role.ADMIN
        assert all(event.days_ago >= 1 for event in spec.events)


def test_one_spec_per_user_and_repo() -> None:
    pairs = [(spec.login, spec.repo) for spec in lease_specs()]
    assert len(pairs) == len(set(pairs))
