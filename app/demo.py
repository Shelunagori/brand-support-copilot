"""Public-demo guards: a Redis daily spend cap (also a client SpendGuard) and per-IP limits."""

import hashlib
import logging
import time
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from redis.asyncio import Redis

from app.nugen.errors import SpendLimitExceeded

if TYPE_CHECKING:
    from app.pricing import Pricing

DAY_TTL_S = 3 * 24 * 3600


class DemoBudget:
    """Daily USD cap shared by all demo traffic. Implements the client's SpendGuard protocol,
    so every paid Nugen call (incl. JSON-repair retries) is counted without touching Postgres."""

    TOTAL_KEY = "demo:spend:total"

    def __init__(self, redis: Redis, price_per_mtok_usd: float, daily_cap_usd: float,
                 total_cap_usd: float | None = None, pricing: "Pricing | None" = None) -> None:
        self._r = redis
        self._price = price_per_mtok_usd
        self._pricing = pricing
        self.cap_usd = daily_cap_usd
        self.total_cap_usd = total_cap_usd

    @staticmethod
    def key() -> str:
        return f"demo:spend:{datetime.now(UTC):%Y-%m-%d}"

    async def spent_today(self) -> float:
        return float(await self._r.get(self.key()) or 0.0)

    async def spent_total(self) -> float:
        return float(await self._r.get(self.TOTAL_KEY) or 0.0)

    async def limit_reason(self) -> str | None:
        """"daily" / "total" when a cap is reached, else None."""
        if await self.spent_today() >= self.cap_usd:
            return "daily"
        if self.total_cap_usd is not None and await self.spent_total() >= self.total_cap_usd:
            return "total"
        return None

    async def limit_reached(self) -> bool:
        return await self.limit_reason() is not None

    async def ensure_budget(self, endpoint: str) -> None:
        if reason := await self.limit_reason():
            raise SpendLimitExceeded(f"demo {reason} spend cap reached; refusing {endpoint}")

    async def record(
        self,
        *,
        endpoint: str,
        model: str | None = None,
        purpose: str | None = None,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
        latency_ms: float | None = None,
        note: str | None = None,
        est_cost_usd: float | None = None,
    ) -> None:
        if est_cost_usd is not None:
            cost = est_cost_usd
        elif self._pricing is not None:
            cost = self._pricing.cost_usd(model, total_tokens)
        else:
            cost = total_tokens / 1e6 * self._price
        key = self.key()
        await self._r.incrbyfloat(key, cost)
        await self._r.expire(key, DAY_TTL_S)
        await self._r.incrbyfloat(self.TOTAL_KEY, cost)


ALIGNED_KILL_KEY = "demo:aligned_disabled"
log = logging.getLogger(__name__)


async def enforce_lifetime_cap(redis: Redis, budget: DemoBudget | None, support: Any,
                               nugen: Any) -> None:
    """Lifetime demo cap reached: undeploy the aligned model once (it may bill per hour) and
    flip a Redis kill switch so every replica answers with the base model from then on."""
    if budget is None or await budget.limit_reason() != "total":
        return
    model_id = support.aligned_model_id
    support.aligned_model_id = None
    if await redis.set(ALIGNED_KILL_KEY, "1", nx=True) and model_id and nugen is not None:
        try:
            await nugen.undeploy_model(model_id)
            log.warning("demo.aligned_auto_undeployed", extra={"model_id": model_id})
        except Exception:
            log.exception("demo.auto_undeploy_failed")


async def hit_hourly_limit(redis: Redis, bucket: str, ident: str, limit: int) -> bool:
    """Fixed one-hour window counter. True when this hit exceeds `limit`."""
    digest = hashlib.sha256(ident.encode()).hexdigest()[:16]
    key = f"demo:{bucket}:{digest}:{int(time.time() // 3600)}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 3700)
    return int(count) > limit
