import pytest

from app.nugen.errors import SpendLimitExceeded
from app.spend import SpendTracker


async def test_alignment_is_charged_at_estimate_and_blocked_past_cap(session_factory) -> None:  # type: ignore[no-untyped-def]
    t = SpendTracker(session_factory, price_per_mtok_usd=1.0, hard_limit_usd=25.0,
                     alignment_cost_est_usd=10.0)
    await t.ensure_budget("alignment-projects/create")
    await t.record(endpoint="alignment-projects/create", purpose="alignment")
    await t.record(endpoint="chat", purpose="query", total_tokens=1_000_000)
    assert await t.total_usd() == pytest.approx(11.0)
    await t.ensure_budget("alignment-projects/create")  # 11 + 10 = 21 <= 25
    await t.record(endpoint="alignment-projects/create", purpose="alignment")
    with pytest.raises(SpendLimitExceeded):
        await t.ensure_budget("alignment-projects/create")  # 21 + 10 > 25
    await t.ensure_budget("chat")  # inference still allowed under the cap


async def test_reconcile_to_billed_total(session_factory) -> None:  # type: ignore[no-untyped-def]
    t = SpendTracker(session_factory, price_per_mtok_usd=1.0, hard_limit_usd=45.0,
                     alignment_cost_est_usd=10.0)
    await t.record(endpoint="alignment-projects/create", purpose="alignment")
    await t.record(endpoint="chat", purpose="eval", total_tokens=1_000_000)
    assert await t.total_usd() == pytest.approx(11.0)
    delta = await t.reconcile(17.15, note="platform billing")
    assert delta == pytest.approx(6.15)
    assert await t.total_usd() == pytest.approx(17.15)
    assert await t.reconcile(17.15, note="again") == pytest.approx(0.0)  # idempotent
