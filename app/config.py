from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    nugen_api_key: SecretStr = SecretStr("")
    nugen_base_url: str = "https://api.nugen.in"
    nugen_base_model_id: str = "Qwen/Qwen2.5-0.5B-Instruct"
    # Pin the aligned model; otherwise the latest DEPLOYED pipeline run is used.
    aligned_model_id: str | None = None
    nugen_timeout_s: float = 60.0
    nugen_max_retries: int = 3
    # Nugen does not publish per-token prices in its API docs; this is an estimate (VETOABLE).
    nugen_price_per_mtok_usd: float = 0.20
    nugen_spend_hard_limit_usd: float = 40.0

    database_url: str = "postgresql+asyncpg://copilot:copilot@localhost:5432/copilot"
    redis_url: str = "redis://localhost:6379/0"

    client_api_keys: str = "dev-key-change-me"
    rate_limit_per_minute: int = 60
    cache_ttl_seconds: int = 3600
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    docs_dir: Path = ROOT / "data" / "docs"
    benchmark_path: Path = ROOT / "data" / "benchmark" / "benchmark.json"
    eval_path: Path = ROOT / "data" / "eval" / "questions.jsonl"
    reports_dir: Path = ROOT / "reports"

    # Scheduled re-alignment only spends credits when this is true.
    auto_realign_confirm: bool = False

    low_confidence_threshold: float = Field(default=0.5, ge=0, le=1)

    @property
    def api_keys(self) -> set[str]:
        return {k.strip() for k in self.client_api_keys.split(",") if k.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
