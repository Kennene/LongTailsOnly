import json
from pathlib import Path

from app.schemas.contract import build_contract

CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contract" / "schema.json"


def test_contract_file_matches_current_schemas() -> None:
    assert CONTRACT_PATH.exists(), "Run: uv run python scripts/export_contract.py"
    committed = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    assert committed == build_contract(), "Schemas changed - run: uv run python scripts/export_contract.py"


def test_contract_contains_every_dto() -> None:
    names = set(build_contract()["$defs"])
    assert {"LeaseOverview", "DecisionRequest", "AppealCreate", "BaselineEntry", "Role"} <= names


def test_contract_properties_have_no_titles() -> None:
    """Field titles make json-schema-to-typescript emit noise aliases like `Id1`, `Name2`."""
    for name, definition in build_contract()["$defs"].items():
        for field, schema in definition.get("properties", {}).items():
            assert "title" not in schema, f"{name}.{field}"
