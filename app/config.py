import os
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

if TYPE_CHECKING:
    from app.pricing import Pricing

ROOT = Path(__file__).resolve().parent.parent
DEV_API_KEY = "dev-key-change-me"


_DROP_PARAMS = {"channel_binding"}  # libpq-only; asyncpg rejects it


def normalize_database_url(url: str) -> str:
    """Accept libpq-style URLs (Neon, Render, Heroku) and make them asyncpg-ready:
    postgres:// -> postgresql+asyncpg://, sslmode=X -> ssl=X, drop libpq-only params."""
    parts = urlsplit(url)
    scheme = parts.scheme
    if scheme in {"postgres", "postgresql"}:
        scheme = "postgresql+asyncpg"
    if not scheme.startswith("postgresql+asyncpg"):
        return url
    params = []
    for k, v in parse_qsl(parts.query, keep_blank_values=True):
        if k in _DROP_PARAMS:
            continue
        params.append(("ssl", v) if k == "sslmode" else (k, v))
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(params), parts.fragment))


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
    # Calibrated from platform billing on 2026-10-22 (see DECISIONS D28).
    nugen_price_per_mtok_usd: float = 38.0  # fallback only; per-model rates live in app/pricing.py
    # Nugen bills per million WORDS (INR, charged in USD): see app/pricing.py and D44.
    nugen_inr_per_usd: float = 96.28
    nugen_words_per_token: float = 0.75
    # Lifetime cap = billed total + (remaining balance - $5 buffer); 2026-10-23: 21.04 + 23.96.
    nugen_spend_hard_limit_usd: float = 45.0
    # Alignment cost is not returned by the API; budget conservatively per run (VETOABLE).
    nugen_alignment_cost_est_usd: float = 8.0

    database_url: str = "postgresql+asyncpg://copilot:copilot@localhost:5432/copilot"
    redis_url: str = "redis://localhost:6379/0"

    client_api_keys: str = DEV_API_KEY
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

    # --- public demo (Render + Vercel) ---
    demo_mode: bool = False
    demo_access_code: SecretStr = SecretStr("")
    # Rate-card estimates; billing ran ~4-5x above the rate card, so these keep real spend
    # near $1/day and $5 lifetime (D45).
    demo_daily_cap_usd: float = 0.25
    # Lifetime cap across all days (Redis counter), so a leaked code can't drain the credit.
    demo_total_cap_usd: float = 1.25
    demo_ip_messages_per_hour: int = 10
    demo_verify_attempts_per_hour: int = 20
    # Only used by `make demo-seed` (local -> Neon); never set on the deployed API.
    demo_database_url: SecretStr = SecretStr("")

    low_confidence_threshold: float = Field(default=0.5, ge=0, le=1)

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        return normalize_database_url(v)

    @property
    def hosted(self) -> bool:
        """Running on a hosting platform (Render sets RENDER=true)."""
        return bool(os.environ.get("RENDER"))

    @property
    def api_keys(self) -> set[str]:
        keys = {k.strip() for k in self.client_api_keys.split(",") if k.strip()}
        if self.hosted:  # the dev default is published in the repo: never valid when hosted
            keys.discard(DEV_API_KEY)
        return keys

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_pricing() -> "Pricing":
    from app.pricing import Pricing

    s = get_settings()
    return Pricing(s.nugen_inr_per_usd, s.nugen_words_per_token)


@lru_cache
def get_settings() -> Settings:
    return Settings()
