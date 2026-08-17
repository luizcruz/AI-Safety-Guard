from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


API_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_prefix="AI_SAFETY_", env_file=API_ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    api_token: str = Field(min_length=16)
    api_host: str = "127.0.0.1"
    api_port: int = Field(default=8000, ge=1, le=65535)
    log_level: Literal["critical", "error", "warning", "info", "debug", "trace"] = "info"
    data_dir: Path = API_ROOT / "data" / "rulesets"
    seed_file: Path = API_ROOT / "seed-ruleset.json"
