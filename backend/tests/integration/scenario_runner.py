"""Execute shared/scenarios/*.json against the real API (ADR 0015, step 6.3).

The runner owns both sides of a scenario: it performs every `when` step,
capturing each response under its alias, and verifies every `then` expectation.
Scenarios stay declarative data — no test code knows what they describe, so a
scenario changed in one place changes the demo and the test together.

Values that depend on seed ordering (a lease id, an appeal id) are never
hardcoded in a scenario; they are referenced with
`{"$from": "<alias>", "where": {...}, "field": "<field>"}` and resolved here.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, NamedTuple

import httpx

REPO_ROOT = Path(__file__).resolve().parents[3]
SCENARIOS_DIR = REPO_ROOT / "shared" / "scenarios"

METHODS = {"GET", "POST", "PUT", "DELETE"}
_MISSING = object()


class Captured(NamedTuple):
    """One captured API response."""

    status_code: int
    body: Any


def load_scenarios() -> list[dict[str, Any]]:
    """Every scenario document, ordered by file name."""
    return [json.loads(path.read_text(encoding="utf-8"))
            for path in sorted(SCENARIOS_DIR.glob("uc-*.json"))]


async def execute_scenario(client: httpx.AsyncClient, scenario: dict[str, Any]) -> dict[str, Captured]:
    """Run every `when` step and return the responses keyed by alias."""
    captured: dict[str, Captured] = {}
    for step in scenario.get("when", []):
        kind = step.get("type")
        if kind == "reset":
            response = await client.post("/api/v1/demo/reset")
        elif kind == "time_travel":
            response = await client.post("/api/v1/simulation/time-travel", json={"days": step["days"]})
        elif kind == "api":
            response = await _call(client, step, captured)
        else:
            raise ValueError(f"nieznany krok when: {kind!r} w scenariuszu {scenario.get('id')!r}")
        if "as" in step:
            captured[step["as"]] = _captured(response)
    return captured


def assert_expectation(target: Captured, expectation: dict[str, Any], scenario_id: str) -> None:
    """Verify one `then` entry against the captured response."""
    expect = expectation["expect"]
    if expectation.get("model") is None:
        assert target.status_code == expect["status_code"], (
            f"{scenario_id}: oczekiwano HTTP {expect['status_code']}, otrzymano {target.status_code}"
        )
        return

    rows = target.body if isinstance(target.body, list) else [target.body]
    where = expectation.get("where")
    if where:
        rows = [row for row in rows if _matches(row, where)]
    assert rows, f"{scenario_id}: brak rekordu dla {where} (HTTP {target.status_code})"

    for key, expected in expect.items():
        actual = _dig(rows[0], key)
        assert actual == expected, (
            f"{scenario_id}: {key} = {actual!r}, oczekiwano {expected!r} (HTTP {target.status_code})"
        )


async def _call(client: httpx.AsyncClient, step: dict[str, Any], captured: dict[str, Captured]) -> httpx.Response:
    method = step["method"]
    if method not in METHODS:
        raise ValueError(f"nieznana metoda HTTP: {method!r}")
    path = _fill_path(step.get("path", ""), step.get("resolve", {}), captured)
    return await client.request(method, path, json=_resolve(step.get("body"), captured))


def _captured(response: httpx.Response) -> Captured:
    try:
        body = response.json()
    except ValueError:
        body = None
    return Captured(response.status_code, body)


def _fill_path(path: str, resolve: dict[str, Any], captured: dict[str, Captured]) -> str:
    for placeholder, reference in resolve.items():
        path = path.replace("{" + placeholder + "}", str(_resolve(reference, captured)))
    return path


def _resolve(value: Any, captured: dict[str, Captured]) -> Any:
    if isinstance(value, dict):
        if "$from" in value:
            return _referenced(value, captured)
        return {key: _resolve(item, captured) for key, item in value.items()}
    if isinstance(value, list):
        return [_resolve(item, captured) for item in value]
    return value


def _referenced(reference: dict[str, Any], captured: dict[str, Captured]) -> Any:
    alias = reference["$from"]
    assert alias in captured, f"scenariusz odwołuje się do '{alias}', którego nie wykonano"
    body = captured[alias].body
    rows = body if isinstance(body, list) else [body]
    where = reference.get("where")
    if where:
        rows = [row for row in rows if _matches(row, where)]
    assert len(rows) == 1, f"'{alias}' + {where} wskazuje {len(rows)} rekordów, oczekiwano 1"
    return rows[0][reference["field"]]


def _matches(record: Any, where: dict[str, Any]) -> bool:
    return all(_dig(record, path) == expected for path, expected in where.items())


def _dig(record: Any, path: str) -> Any:
    current = record
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return _MISSING
        current = current[part]
    return current
