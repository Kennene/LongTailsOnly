from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./longtails.db"
    github_org: str = "longtails"
    admin_login: str = "tomasz-admin"  # acting admin: the MVP has no login (ADR 0010 §2)
    enable_demo_reset: bool = True


settings = Settings()


def get_settings() -> Settings:
    return settings
