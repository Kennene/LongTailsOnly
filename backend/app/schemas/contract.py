from typing import Any

from pydantic.json_schema import models_json_schema

from app.schemas import CONTRACT_REQUEST_MODELS, CONTRACT_RESPONSE_MODELS


def _drop_property_titles(definitions: dict[str, Any]) -> None:
    """Field titles make json-schema-to-typescript emit noise aliases (`Id1`, `Name2`)."""
    for definition in definitions.values():
        for schema in definition.get("properties", {}).values():
            schema.pop("title", None)


def build_contract() -> dict[str, Any]:
    models = [(m, "validation") for m in CONTRACT_REQUEST_MODELS] + [
        (m, "serialization") for m in CONTRACT_RESPONSE_MODELS
    ]
    _, schema = models_json_schema(models, title="TailCut API contract")
    _drop_property_titles(schema["$defs"])
    return schema
