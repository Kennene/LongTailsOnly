import tomllib
import unittest
from pathlib import Path

PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"


class ProjectSetupTest(unittest.TestCase):
    def test_pyproject_declares_backend_dependencies_and_pytest(self) -> None:
        data = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
        project = data["project"]

        self.assertEqual(project["requires-python"], ">=3.14")

        runtime = " ".join(project["dependencies"])
        for name in ("fastapi", "uvicorn", "sqlalchemy", "aiosqlite", "pydantic"):
            self.assertIn(name, runtime)

        dev = " ".join(project["optional-dependencies"]["dev"])
        for name in ("pytest", "pytest-asyncio", "httpx"):
            self.assertIn(name, dev)

        self.assertIn("pytest", data["tool"])
        self.assertIn("build-system", data)
