import re
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[2] / "app"
ALLOWED = {APP_DIR / "core" / "time_provider.py"}
FORBIDDEN = re.compile(r"datetime\.now\(|datetime\.utcnow\(|date\.today\(|time\.time\(")


def test_domain_code_never_reads_system_clock() -> None:
    offenders = [
        f"{path.relative_to(APP_DIR)}:{number}"
        for path in APP_DIR.rglob("*.py")
        if path not in ALLOWED
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if FORBIDDEN.search(line)
    ]
    assert offenders == [], f"Use TimeProvider.get_current_time() instead: {offenders}"
