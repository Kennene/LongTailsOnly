from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite+aiosqlite:///./lease_governor.db"
    github_org: str = "longtails"
    default_lease_days: int = 30
    warning_days: int = 7
    seed_demo: bool = True
    github_docs_url: str = "https://docs.github.com/rest"
