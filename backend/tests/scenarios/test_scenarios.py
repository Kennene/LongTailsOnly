"""Demo scenario validation (ADR 0012).

Scenarios are executable data: shared/scenarios/*.json drive both the demo script
and, once the view endpoints exist, the end-to-end tests in tests/integration/.

They describe the deterministic seed from ADR 0008 rather than re-declaring leases
and activity of their own — the seed already produces a reproducible organisation,
and a second copy here would drift from it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import app.schemas as schemas
from app.db import seed_data

REPO_ROOT = Path(__file__).resolve().parents[3]
SCENARIOS_DIR = REPO_ROOT / "shared" / "scenarios"

USE_CASES = {"UC-1", "UC-2", "UC-3", "UC-4", "UC-5"}
TIME_TRAVEL_BOUNDS = (1, 365)
KNOWN_STEP_TYPES = {"reset", "time_travel", "api"}


def contract_models() -> dict[str, type]:
    models = [*schemas.CONTRACT_REQUEST_MODELS, *schemas.CONTRACT_RESPONSE_MODELS]
    return {model.__name__: model for model in models}


def load_scenarios() -> list[dict[str, Any]]:
    if not SCENARIOS_DIR.is_dir():
        return []
    return [json.loads(path.read_text(encoding="utf-8"))
            for path in sorted(SCENARIOS_DIR.glob("uc-*.json"))]


SCENARIOS = load_scenarios()
SCENARIO_IDS = [scenario["id"] for scenario in SCENARIOS]


def scenario_by_use_case(use_case: str) -> dict[str, Any]:
    for scenario in SCENARIOS:
        if scenario["use_case"] == use_case:
            return scenario
    raise AssertionError(f"brak scenariusza dla {use_case}")


def seed_logins() -> set[str]:
    logins = {seed_data.ADMIN_LOGIN}
    for members in seed_data.TEAM_MEMBERS.values():
        logins.update(login for login, _ in members)
    return logins


def walk(value: Any, key: str = "") -> list[tuple[str, Any]]:
    """Every (key, leaf) pair in a nested document."""
    pairs: list[tuple[str, Any]] = []
    if isinstance(value, dict):
        for child_key, child in value.items():
            pairs.extend(walk(child, child_key))
    elif isinstance(value, list):
        for item in value:
            pairs.extend(walk(item, key))
    else:
        pairs.append((key, value))
    return pairs


def test_scenarios_cover_every_use_case_uc1_to_uc5() -> None:
    assert SCENARIOS, "brak plików scenariuszy w shared/scenarios/"
    assert {scenario["use_case"] for scenario in SCENARIOS} == USE_CASES


def test_scenario_ids_are_unique() -> None:
    assert len(SCENARIO_IDS) == len(set(SCENARIO_IDS)), f"zduplikowane id: {SCENARIO_IDS}"


def test_every_scenario_starts_with_reset() -> None:
    for scenario in SCENARIOS:
        steps = scenario["when"]
        assert steps, f"{scenario['id']}: brak kroków when"
        assert steps[0]["type"] == "reset", (
            f"{scenario['id']}: scenariusz nie zaczyna się od reset, więc zależy od stanu "
            f"poprzedniego scenariusza"
        )


def test_every_scenario_uses_known_step_types() -> None:
    for scenario in SCENARIOS:
        for step in scenario["when"]:
            assert step["type"] in KNOWN_STEP_TYPES, (
                f"{scenario['id']}: nieznany krok {step['type']!r}"
            )


def test_every_expectation_targets_a_fetched_alias() -> None:
    for scenario in SCENARIOS:
        aliases = {step["as"] for step in scenario["when"] if step["type"] == "api"}
        for expectation in scenario["then"]:
            assert expectation["target"] in aliases, (
                f"{scenario['id']}: oczekiwanie na '{expectation['target']}', "
                f"ale żaden krok when nie pobiera tej wartości"
            )


def test_record_expectations_reference_contract_fields() -> None:
    models = contract_models()
    for scenario in SCENARIOS:
        for expectation in scenario["then"]:
            model_name = expectation.get("model")
            if model_name is None:
                continue
            assert model_name in models, f"{scenario['id']}: nieznany model {model_name!r}"
            fields = set(models[model_name].model_fields)
            unknown = set(expectation["expect"]) - fields
            assert unknown == set(), (
                f"{scenario['id']}: oczekiwania na pola spoza {model_name}: {sorted(unknown)}"
            )


def test_status_expectations_use_http_status_codes() -> None:
    for scenario in SCENARIOS:
        for expectation in scenario["then"]:
            if expectation.get("model") is not None:
                continue
            assert set(expectation["expect"]) == {"status_code"}, (
                f"{scenario['id']}: oczekiwanie bez modelu może zawierać wyłącznie status_code"
            )
            code = expectation["expect"]["status_code"]
            assert isinstance(code, int) and 100 <= code <= 599, (
                f"{scenario['id']}: niepoprawny kod HTTP {code!r}"
            )


def test_time_travel_steps_are_within_contract_bounds() -> None:
    low, high = TIME_TRAVEL_BOUNDS
    for scenario in SCENARIOS:
        for step in scenario["when"]:
            if step["type"] != "time_travel":
                continue
            assert low <= step["days"] <= high, (
                f"{scenario['id']}: skok {step['days']} dni poza zakresem TimeTravelRequest "
                f"({low}..{high})"
            )


def test_uc4_scenario_observes_active_then_warning_then_expired() -> None:
    scenario = scenario_by_use_case("UC-4")
    statuses = [
        expectation["expect"]["status"]
        for expectation in scenario["then"]
        if "status" in expectation["expect"]
    ]
    assert statuses[:3] == ["ACTIVE", "WARNING", "EXPIRED"], (
        f"UC-4 nie pokazuje pełnego cyklu życia, tylko {statuses}"
    )


def test_last_admin_scenario_builds_a_second_admin_before_asserting_protection() -> None:
    scenario = scenario_by_use_case("UC-5")
    grants = [
        step for step in scenario["when"]
        if step["type"] == "api" and step.get("method") == "PUT"
    ]
    assert grants, (
        "UC-5 nie nadaje drugiego administratora, więc asercja 403 byłaby pusta — "
        "seed ma dokładnie jednego admina na repozytorium (ADR 0008)"
    )
    codes = {
        expectation["expect"]["status_code"]
        for expectation in scenario["then"]
        if "status_code" in expectation["expect"]
    }
    assert 204 in codes, (
        "UC-5 nie pokazuje udanego odebrania admina przy dwóch administratorach, "
        "więc nie dowodzi, że straż jest wybiórcza, a nie zawsze blokująca"
    )
    assert 403 in codes, "UC-5 nie sprawdza odmowy odebrania ostatniego administratora"


def test_scenario_logins_belong_to_seed_population() -> None:
    allowed = seed_logins()
    for scenario in SCENARIOS:
        for key, value in walk(scenario):
            if key == "login" or key.endswith(".login") or key == "username":
                assert value in allowed, (
                    f"{scenario['id']}: login {value!r} spoza populacji seeda"
                )


def test_scenario_repositories_belong_to_seed_population() -> None:
    allowed = set(seed_data.REPOSITORIES)
    for scenario in SCENARIOS:
        for key, value in walk(scenario):
            if key == "repo" or key.endswith(".repo") or key.endswith(".name"):
                if isinstance(value, str) and value not in allowed:
                    raise AssertionError(
                        f"{scenario['id']}: {key}={value!r} spoza repozytoriów seeda"
                    )


def test_scenarios_are_utf8_without_bom() -> None:
    for path in sorted(SCENARIOS_DIR.glob("*.json")):
        raw = path.read_bytes()
        assert not raw.startswith(b"\xef\xbb\xbf"), f"{path.name} zaczyna się od BOM"
        raw.decode("utf-8")
