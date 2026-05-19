from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = "development"
    app_name: str = "AW Client Report Portal"
    app_host: str = "0.0.0.0"  # nosec B104 - bind all interfaces inside container
    app_port: int = 8000

    database_url: str = "sqlite:///./data/aw_portal.db"

    jwt_secret: str = Field(min_length=16)
    jwt_algorithm: str = "HS256"
    jwt_access_token_ttl_minutes: int = 15
    jwt_refresh_token_ttl_days: int = 7

    fernet_key: str = ""

    cors_origins: str = "http://localhost:5173"

    cookie_secure: bool = False
    cookie_domain: str = ""

    rate_limit_default: str = "60/minute"
    rate_limit_login: str = "5/15minutes"

    pdf_storage_dir: str = "./data/pdfs"

    log_level: str = "INFO"

    seed_admin_email: str = "admin@windbrook.app"
    seed_admin_password: str = "ChangeMe!2026"

    canva_api_key: str = ""
    canva_api_base_url: str = "https://api.canva.com/rest"

    @property
    def canva_enabled(self) -> bool:
        return bool(self.canva_api_key.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def pdf_storage_path(self) -> Path:
        path = Path(self.pdf_storage_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @field_validator("jwt_secret")
    @classmethod
    def _validate_jwt_secret(cls, value: str) -> str:
        if value.strip().lower() in {"", "change-me", "secret"}:
            raise ValueError("JWT_SECRET must be set to a strong, random value")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
