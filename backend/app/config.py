from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PIXBILL_")

    data_dir: Path = Path("./data")
    password: str = "zmien-mnie"
    secret_key: str = "dev-secret-change-me"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5vl:3b"
    ollama_timeout_seconds: float = 300
    photo_retention_days: int = 10
    cleanup_interval_seconds: int = 3600

    @property
    def db_path(self) -> Path:
        return self.data_dir / "pixbill.db"

    @property
    def photos_dir(self) -> Path:
        return self.data_dir / "photos"


@lru_cache
def get_settings() -> Settings:
    return Settings()
