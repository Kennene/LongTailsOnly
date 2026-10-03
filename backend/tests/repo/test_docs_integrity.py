"""Repo-level consistency checks (ADR 0013).

These tests read files outside ``backend/`` — the ADR index, the PR template,
the MCP config and .gitignore — so they resolve the repository root from
``__file__`` instead of relying on the current working directory.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parents[3]
ADR_DIR = REPO_ROOT / "docs" / "adr"
ADR_INDEX = ADR_DIR / "README.md"
PR_TEMPLATE = REPO_ROOT / ".github" / "pull_request_template.md"
MCP_CONFIG = REPO_ROOT / ".mcp.json"
GITIGNORE = REPO_ROOT / ".gitignore"

ADR_FILENAME = re.compile(r"^(?P<number>\d{4})-[a-z0-9-]+\.md$")
MARKDOWN_LINK = re.compile(r"\[(?P<label>[^\]]+)\]\((?P<target>[^)\s]+)\)")
ADR_CHECKBOX = re.compile(r"^- \[ \] .*ADR", re.MULTILINE)


def adr_files() -> list[Path]:
    """Every ADR document, excluding the index itself."""
    return sorted(path for path in ADR_DIR.glob("*.md") if path.name != "README.md")


def test_every_adr_file_is_listed_in_index() -> None:
    index_text = ADR_INDEX.read_text(encoding="utf-8")
    missing = [path.name for path in adr_files() if path.name not in index_text]
    assert missing == [], f"ADR-y poza indeksem: {missing}"


def test_adr_numbers_are_unique() -> None:
    numbers: list[str] = []
    for path in adr_files():
        match = ADR_FILENAME.match(path.name)
        assert match is not None, f"nazwa ADR-a niezgodna z NNNN-slug.md: {path.name}"
        numbers.append(match.group("number"))
    duplicates = sorted({n for n in numbers if numbers.count(n) > 1})
    assert duplicates == [], f"zduplikowane numery ADR-ów: {duplicates}"


def test_every_index_entry_points_to_an_existing_file() -> None:
    index_text = ADR_INDEX.read_text(encoding="utf-8")
    targets = [
        match.group("target")
        for match in MARKDOWN_LINK.finditer(index_text)
        if ADR_FILENAME.match(match.group("target"))
    ]
    assert targets, "indeks ADR-ów nie zawiera żadnego linku do dokumentu ADR"
    broken = [target for target in targets if not (ADR_DIR / target).is_file()]
    assert broken == [], f"linki w indeksie bez pliku: {broken}"


def test_pull_request_template_requires_adr_check() -> None:
    assert PR_TEMPLATE.is_file(), f"brak szablonu PR: {PR_TEMPLATE}"
    template_text = PR_TEMPLATE.read_text(encoding="utf-8")
    assert ADR_CHECKBOX.search(template_text) is not None, (
        "szablon PR nie zawiera punktu listy kontrolnej o wpływie na ADR-y"
    )


def test_mcp_config_declares_prelint_server() -> None:
    config = json.loads(MCP_CONFIG.read_text(encoding="utf-8"))
    servers = config.get("mcpServers", {})
    assert "prelint" in servers, "brak serwera 'prelint' w .mcp.json"
    url = servers["prelint"].get("url", "")
    parsed = urlparse(url)
    assert parsed.scheme == "https" and parsed.netloc, f"niepoprawny adres Prelinta: {url!r}"


def test_gitignore_excludes_python_and_node_artifacts() -> None:
    gitignore_text = GITIGNORE.read_text(encoding="utf-8")
    required = ["__pycache__/", ".venv/", ".pytest_cache/", "node_modules/"]
    missing = [entry for entry in required if entry not in gitignore_text]
    assert missing == [], f".gitignore nie zawiera: {missing}"
