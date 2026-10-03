"""End-to-end run of shared/scenarios against the real API (ADR 0015, step 6.3).

The scenario files are the single source of truth: this module contains no
hand-written expectations of its own, it executes what the data says. The API,
the seed and the frozen clock come from `integration/conftest.py`.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from tests.integration.scenario_runner import assert_expectation, execute_scenario, load_scenarios

SCENARIOS = load_scenarios()
SCENARIO_IDS = [scenario["id"] for scenario in SCENARIOS]


def test_every_use_case_scenario_was_loaded() -> None:
    assert len(SCENARIOS) == 5, f"oczekiwano 5 scenariuszy, wczytano {len(SCENARIOS)}"
    assert {scenario["use_case"] for scenario in SCENARIOS} == {"UC-1", "UC-2", "UC-3", "UC-4", "UC-5"}


@pytest.mark.parametrize("scenario", SCENARIOS, ids=SCENARIO_IDS)
async def test_scenario_matches_expected_outcomes(demo: httpx.AsyncClient, scenario: dict[str, Any]) -> None:
    captured = await execute_scenario(demo, scenario)
    for expectation in scenario["then"]:
        target = expectation["target"]
        assert target in captured, f"{scenario['id']}: krok '{target}' nie został wykonany"
        assert_expectation(captured[target], expectation, scenario["id"])


@pytest.mark.parametrize("scenario", SCENARIOS, ids=SCENARIO_IDS)
async def test_scenario_gives_the_same_result_twice(demo: httpx.AsyncClient, scenario: dict[str, Any]) -> None:
    """Each scenario starts with reset, so a second run must not inherit state."""
    first = await execute_scenario(demo, scenario)
    second = await execute_scenario(demo, scenario)
    for expectation in scenario["then"]:
        assert_expectation(first[expectation["target"]], expectation, scenario["id"])
        assert_expectation(second[expectation["target"]], expectation, scenario["id"])


async def test_unknown_step_type_is_rejected(demo: httpx.AsyncClient) -> None:
    broken = {"id": "x", "use_case": "UC-9", "when": [{"type": "nonsense"}], "then": []}
    with pytest.raises(ValueError, match="nonsense"):
        await execute_scenario(demo, broken)
