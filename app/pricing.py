"""Nugen usage-based pricing (Org Settings -> Usage-Based Pricing, 2026-10-23).

Rates are INR per 1M *words*, billed in USD. Converted per token with ~0.75 words/token.
Alignment is billed on the words Nugen processes (incl. its generated synthetic data), which
the API doesn't expose, so alignment keeps a per-run estimate from real billing instead.
"""

from typing import Literal

Tier = Literal["nano", "small"]
Kind = Literal["general", "aligned", "alignment"]

INR_PER_MWORDS: dict[Tier, dict[Kind, float]] = {
    "nano": {"general": 944.0, "aligned": 1888.0, "alignment": 9439.0},   # <= 1B params
    "small": {"general": 472.0, "aligned": 944.0, "alignment": 4720.0},  # 1B - 10B params
}
# Base models we know the size of (from GET /models/base); anything else is priced as nano,
# the dearest tier, so the guard over- rather than under-estimates.
BASE_TIERS: dict[str, Tier] = {
    "Qwen/Qwen2.5-0.5B-Instruct": "nano",
    "Qwen/Qwen2.5-1.5B-Instruct": "small",
    "Qwen/Qwen2.5-3B-Instruct": "small",
    "meta-llama/Llama-3.2-3B-Instruct": "small",
    "microsoft/Phi-3-mini-4k-instruct": "small",
    "microsoft/Phi-4-mini-instruct": "small",
    "Qwen/Qwen3-4B-Instruct-2507": "small",
}


class Pricing:
    def __init__(self, inr_per_usd: float, words_per_token: float) -> None:
        self.inr_per_usd = inr_per_usd
        self.words_per_token = words_per_token
        self._aligned_base: dict[str, str] = {}

    def register_aligned(self, model_id: str, base_model_id: str) -> None:
        self._aligned_base[model_id] = base_model_id

    @staticmethod
    def is_aligned(model_id: str) -> bool:
        return model_id.startswith("model_")

    def tier(self, model_id: str) -> Tier:
        base = self._aligned_base.get(model_id, model_id)
        return BASE_TIERS.get(base, "nano")

    def usd_per_mtok(self, model_id: str, kind: Kind | None = None) -> float:
        kind = kind or ("aligned" if self.is_aligned(model_id) else "general")
        inr_per_mwords = INR_PER_MWORDS[self.tier(model_id)][kind]
        return inr_per_mwords / self.inr_per_usd * self.words_per_token

    def cost_usd(self, model_id: str | None, total_tokens: int) -> float:
        return total_tokens / 1e6 * self.usd_per_mtok(model_id or "unknown")
