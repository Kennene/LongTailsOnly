import json
from pathlib import Path

from app.schemas.contract import build_contract

OUTPUT = Path(__file__).resolve().parents[1] / "contract" / "schema.json"


def main() -> None:
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(build_contract(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Contract written to {OUTPUT}")


if __name__ == "__main__":
    main()
