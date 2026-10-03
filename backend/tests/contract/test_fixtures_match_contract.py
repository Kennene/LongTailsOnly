"""Validate shared/fixtures against the contract generated from Pydantic (ADR 0011).

The fixtures are data, not a second contract: every file is validated by the very
model that generates backend/contract/schema.json, so a rename or an enum change in
app/schemas/ fails here instead of surfacing as an empty table cell in the dashboard.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel

import app.schemas as schemas
from app.db import seed_data

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = REPO_ROOT / "shared" / "fixtures"
MANIFEST_PATH = FIXTURES_DIR / "manifest.json"

VALID_SHAPES = {"list", "single"}


def contract_models() -> dict[str, type[BaseModel]]:
    models = [*schemas.CONTRACT_REQUEST_MODELS, *schemas.CONTRACT_RESPONSE_MODELS]
    return {model.__name__: model for model in models}


def manifest_entries() -> list[dict[str, Any]]:
    if not MANIFEST_PATH.is_file():
        return []
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))["fixtures"]


def entry(fixture_id: str) -> dict[str, Any]:
    for candidate in manifest_entries():
        if candidate["id"] == fixture_id:
            return candidate
    raise AssertionError(f"brak wpisu '{fixture_id}' w manifest.json")


def fixture_body(fixture_id: str) -> Any:
    item = entry(fixture_id)
    return json.loads((FIXTURES_DIR / item["file"]).read_text(encoding="utf-8"))


def fixture_records(model_name: str) -> list[dict[str, Any]]:
    """Every record of a model, across all fixture files that declare it."""
    records: list[dict[str, Any]] = []
    for item in manifest_entries():
        if item["model"] != model_name:
            continue
        body = json.loads((FIXTURES_DIR / item["file"]).read_text(encoding="utf-8"))
        records.extend(body if item["shape"] == "list" else [body])
    return records


def seed_logins() -> set[str]:
    logins = {seed_data.ADMIN_LOGIN}
    for members in seed_data.TEAM_MEMBERS.values():
        logins.update(login for login, _ in members)
    return logins


def collect_timestamp_strings(value: Any, key: str = "") -> list[tuple[str, str]]:
    """Every string under a datetime-bearing key, anywhere in the document."""
    found: list[tuple[str, str]] = []
    if isinstance(value, dict):
        for child_key, child in value.items():
            found.extend(collect_timestamp_strings(child, child_key))
    elif isinstance(value, list):
        for item in value:
            found.extend(collect_timestamp_strings(item, key))
    elif isinstance(value, str) and (key.endswith("_at") or key == "timestamp"):
        found.append((key, value))
    return found


ENTRIES = manifest_entries()
ENTRY_IDS = [item["id"] for item in ENTRIES]


def test_manifest_exists_and_lists_fixtures() -> None:
    assert MANIFEST_PATH.is_file(), f"brak manifestu fixtures: {MANIFEST_PATH}"
    assert ENTRIES, "manifest.json nie zawiera żadnych pozycji"


def test_manifest_lists_every_fixture_file_and_every_file_is_listed() -> None:
    declared = {item["file"] for item in ENTRIES}
    on_disk = {path.name for path in FIXTURES_DIR.glob("*.json")} - {MANIFEST_PATH.name}
    assert declared == on_disk, (
        f"rozjazd manifestu i plików — w manifeście bez pliku: {sorted(declared - on_disk)}, "
        f"pliki bez wpisu: {sorted(on_disk - declared)}"
    )


def test_manifest_entries_declare_known_shape_and_consumers() -> None:
    models = contract_models()
    for item in ENTRIES:
        assert item["shape"] in VALID_SHAPES, f"{item['id']}: nieznany shape {item['shape']!r}"
        assert item["model"] in models, f"{item['id']}: nieznany model {item['model']!r}"
        assert item["consumedBy"], f"{item['id']}: brak konsumentów w consumedBy"


@pytest.mark.parametrize("item", ENTRIES, ids=ENTRY_IDS)
def test_every_fixture_validates_against_its_contract_model(item: dict[str, Any]) -> None:
    model = contract_models()[item["model"]]
    body = json.loads((FIXTURES_DIR / item["file"]).read_text(encoding="utf-8"))
    if item["shape"] == "list":
        assert isinstance(body, list), f"{item['id']}: shape=list, a plik nie jest listą"
        for record in body:
            model.model_validate(record)
    else:
        assert isinstance(body, dict), f"{item['id']}: shape=single, a plik nie jest obiektem"
        model.model_validate(body)


def test_fixture_references_resolve_inside_fixture_set() -> None:
    user_ids = {user["id"] for user in fixture_body("users")}
    repo_ids = {repo["id"] for repo in fixture_body("repositories")}
    leases = fixture_records("LeaseOverview")
    lease_ids = {lease["id"] for lease in leases}

    for lease in leases:
        assert lease["user"]["id"] in user_ids, f"dzierżawa {lease['id']} wskazuje nieznanego usera"
        assert lease["repository"]["id"] in repo_ids, f"dzierżawa {lease['id']} wskazuje nieznane repo"

    for appeal in fixture_body("appeals"):
        assert appeal["user_id"] in user_ids, f"odwołanie {appeal['id']}: nieznany user_id"
        assert appeal["repo_id"] in repo_ids, f"odwołanie {appeal['id']}: nieznany repo_id"
        assert appeal["lease_id"] in lease_ids, f"odwołanie {appeal['id']}: nieznany lease_id"

    for event in fixture_body("activity"):
        assert event["user_id"] in user_ids, f"zdarzenie {event['id']}: nieznany user_id"
        assert event["repo_id"] in repo_ids, f"zdarzenie {event['id']}: nieznany repo_id"

    for log in fixture_body("audit"):
        if log["actor_id"] is not None:
            assert log["actor_id"] in user_ids, f"audyt {log['id']}: nieznany actor_id"


def test_lease_fixtures_cover_all_statuses_roles_and_recommendations() -> None:
    leases = fixture_records("LeaseOverview")
    assert {lease["status"] for lease in leases} == {"ACTIVE", "WARNING", "EXPIRED"}
    assert {lease["current_role"] for lease in leases} == {"write", "read", "admin"}
    assert {lease["recommendation"] for lease in leases} == {"KEEP", "DOWNSCOPE", "REVOKE"}


def test_lease_fixtures_include_a_null_days_remaining_case() -> None:
    leases = fixture_records("LeaseOverview")
    permanent = [lease for lease in leases if lease["days_remaining"] is None]
    assert permanent, "brak dzierżawy z days_remaining == None (stały admin z expires_at = NULL)"
    assert all(lease["expires_at"] is None for lease in permanent), (
        "days_remaining == None występuje przy niepustym expires_at"
    )


def test_fixture_timestamps_are_timezone_aware() -> None:
    for item in ENTRIES:
        body = json.loads((FIXTURES_DIR / item["file"]).read_text(encoding="utf-8"))
        for key, raw in collect_timestamp_strings(body):
            parsed = datetime.fromisoformat(raw)
            assert parsed.tzinfo is not None, f"{item['id']}:{key} bez strefy czasowej: {raw!r}"


def test_fixtures_are_utf8_without_bom() -> None:
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        raw = path.read_bytes()
        assert not raw.startswith(b"\xef\xbb\xbf"), f"{path.name} zaczyna się od BOM"
        raw.decode("utf-8")


def test_polish_names_survive_roundtrip() -> None:
    names = {user["name"] for user in fixture_body("users")}
    for expected in ("Rafał", "Sylwia"):
        assert expected in names, f"brak {expected!r} w fixtures użytkowników"
        assert json.loads(json.dumps(expected)) == expected


def test_fixtures_use_seed_population_logins() -> None:
    allowed = seed_logins()
    unknown = {user["login"] for user in fixture_body("users")} - allowed
    assert unknown == set(), f"loginy spoza populacji seeda: {sorted(unknown)}"
