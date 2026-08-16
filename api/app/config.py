from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_prefix="AI_SAFETY_", env_file=".env", extra="ignore")

    api_token: str = Field(min_length=16)
    data_dir: Path = Path(__file__).resolve().parents[1] / "data" / "rulesets"
    seed_file: Path = Path(__file__).resolve().parents[1] / "seed-ruleset.json"
