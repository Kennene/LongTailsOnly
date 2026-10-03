from pydantic_settings import BaseSettings, SettingsConfigDict

from app.db.seed_data import ADMIN_LOGIN


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./longtails.db"
    github_org: str = "longtails"
    jira_site: str = "longtails"
    admin_login: str = ADMIN_LOGIN  # acting admin: the MVP has no login (ADR 0014 §2)
    enable_demo_reset: bool = True


settings = Settings()


def get_settings() -> Settings:
    return settings
