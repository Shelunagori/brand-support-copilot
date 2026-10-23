import pytest
from redis.asyncio import Redis

from app.demo import DemoBudget
from app.pricing import Pricing


def test_rate_card_converted_per_million_tokens() -> None:
    p = Pricing(inr_per_usd=96.28, words_per_token=0.75)
    # INR per 1M words / 96.28 * 0.75 words per token
    assert p.usd_per_mtok("Qwen/Qwen2.5-0.5B-Instruct") == pytest.approx(944 / 96.28 * 0.75)
    assert p.usd_per_mtok("meta-llama/Llama-3.2-3B-Instruct") == pytest.approx(472 / 96.28 * 0.75)


def test_aligned_models_use_their_base_tier_and_default_to_the_dearest() -> None:
    p = Pricing(inr_per_usd=96.28, words_per_token=0.75)
    unknown = p.usd_per_mtok("model_unknown")
    assert unknown == pytest.approx(1888 / 96.28 * 0.75)  # nano aligned: most expensive
    p.register_aligned("model_exp3", "meta-llama/Llama-3.2-3B-Instruct")
    assert p.usd_per_mtok("model_exp3") == pytest.approx(944 / 96.28 * 0.75)  # small aligned
    assert p.cost_usd("model_exp3", 1_000_000) == pytest.approx(944 / 96.28 * 0.75)


def test_unknown_base_model_is_priced_conservatively() -> None:
    p = Pricing(inr_per_usd=96.28, words_per_token=0.75)
    assert p.tier("some/New-Model") == "nano"


async def test_demo_budget_prices_by_model() -> None:
    redis: Redis = Redis.from_url("redis://localhost:6379/15", decode_responses=True)
    await redis.flushdb()
    p = Pricing(inr_per_usd=96.28, words_per_token=0.75)
    p.register_aligned("model_exp3", "meta-llama/Llama-3.2-3B-Instruct")
    b = DemoBudget(redis, 0.0, daily_cap_usd=1.0, pricing=p)
    await b.record(endpoint="chat", model="model_exp3", total_tokens=10_000)
    assert await b.spent_today() == pytest.approx(10_000 / 1e6 * 944 / 96.28 * 0.75)
    await redis.flushdb()
    await redis.aclose()
