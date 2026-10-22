"""Factories wiring settings -> client / spend tracker / pipeline (shared by CLI, API, worker)."""

from app.config import Settings, get_settings
from app.db import get_session_factory
from app.nugen.client import NugenClient
from app.pipeline import AlignmentPipeline
from app.spend import SpendTracker


def build_spend(settings: Settings | None = None) -> SpendTracker:
    s = settings or get_settings()
    return SpendTracker(get_session_factory(), s.nugen_price_per_mtok_usd,
                        s.nugen_spend_hard_limit_usd, s.nugen_alignment_cost_est_usd)


def build_client(settings: Settings | None = None, spend: SpendTracker | None = None
                 ) -> NugenClient:
    s = settings or get_settings()
    return NugenClient(
        s.nugen_api_key.get_secret_value(),
        s.nugen_base_url,
        timeout_s=s.nugen_timeout_s,
        max_retries=s.nugen_max_retries,
        spend=spend or build_spend(s),
    )


def build_pipeline(client: NugenClient, settings: Settings | None = None,
                   poll_interval: float = 15.0, base_model_id: str | None = None,
                   active_only: bool = False) -> AlignmentPipeline:
    s = settings or get_settings()
    return AlignmentPipeline(
        session_factory=get_session_factory(),
        client=client,
        docs_dir=s.docs_dir,
        benchmark_path=s.benchmark_path,
        base_model_id=base_model_id or s.nugen_base_model_id,
        poll_interval=poll_interval,
        active_only=active_only,
    )
