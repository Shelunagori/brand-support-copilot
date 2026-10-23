"""Spend log + hard budget guard for paid Nugen calls."""

import logging
from typing import TYPE_CHECKING, Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import SpendEntry
from app.nugen.errors import SpendLimitExceeded

if TYPE_CHECKING:
    from app.pricing import Pricing

log = logging.getLogger(__name__)


class SpendTracker:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        price_per_mtok_usd: float,
        hard_limit_usd: float,
        alignment_cost_est_usd: float = 0.0,
        pricing: "Pricing | None" = None,
    ) -> None:
        self._sf = session_factory
        self._price = price_per_mtok_usd
        self._limit = hard_limit_usd
        self._alignment_est = alignment_cost_est_usd
        self._pricing = pricing

    def estimate(self, total_tokens: int) -> float:
        return total_tokens / 1_000_000 * self._price

    async def total_usd(self) -> float:
        async with self._sf() as s:
            total = await s.scalar(select(func.coalesce(func.sum(SpendEntry.est_cost_usd), 0.0)))
        return float(total or 0.0)

    async def ensure_budget(self, endpoint: str) -> None:
        spent = await self.total_usd()
        projected = spent + (self._alignment_est if "alignment" in endpoint else 0.0)
        if spent >= self._limit or projected > self._limit:
            raise SpendLimitExceeded(
                f"estimated spend ${spent:.4f} (+${projected - spent:.2f} for this call) would "
                f"cross the ${self._limit:.2f} hard limit; refusing {endpoint}"
            )

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
        elif purpose == "alignment":
            cost = self._alignment_est  # the API does not report alignment cost
        elif self._pricing is not None:
            cost = self._pricing.cost_usd(model, total_tokens)
        else:
            cost = self.estimate(total_tokens)
        async with self._sf() as s:
            s.add(SpendEntry(
                endpoint=endpoint, model=model, purpose=purpose, prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens, total_tokens=total_tokens,
                est_cost_usd=cost, latency_ms=latency_ms, note=note,
            ))
            await s.commit()
        log.info("nugen.spend", extra={"endpoint": endpoint, "model": model, "purpose": purpose,
                                       "total_tokens": total_tokens, "est_cost_usd": cost})

    async def reconcile(self, billed_total_usd: float, note: str) -> float:
        """Add one correction entry so the logged total equals the platform-billed total."""
        delta = round(billed_total_usd - await self.total_usd(), 6)
        if abs(delta) >= 0.000001:
            await self.record(endpoint="(billing reconciliation)", purpose="reconciliation",
                              est_cost_usd=delta, note=note)
        return delta

    async def summary(self) -> list[dict[str, Any]]:
        async with self._sf() as s:
            rows = await s.execute(
                select(
                    SpendEntry.purpose,
                    SpendEntry.endpoint,
                    func.count(),
                    func.sum(SpendEntry.total_tokens),
                    func.sum(SpendEntry.est_cost_usd),
                ).group_by(SpendEntry.purpose, SpendEntry.endpoint)
            )
            return [
                {"purpose": p, "endpoint": e, "calls": c, "tokens": int(t or 0),
                 "est_cost_usd": float(u or 0)}
                for p, e, c, t, u in rows.all()
            ]
