from app.eval.scoring import EvalQuestion, normalize_text, percentile, score, summarize
from app.support.schema import SupportResponse


def q(**kw: object) -> EvalQuestion:
    base: dict[str, object] = dict(id="q1", category="returns", question="?", expected_facts=[],
                                   expected_any=[], forbidden_facts=[], expected_escalate=False,
                                   expected_policy_ref="UT-RET-001")
    base.update(kw)
    return EvalQuestion.model_validate(base)


def resp(answer: str, escalate: bool = False, ref: str | None = "UT-RET-001",
         json_ok: bool = True, fallback: bool = False, latency: float = 100,
         model_escalate: bool | None = None) -> SupportResponse:
    return SupportResponse(intent="returns", answer=answer, policy_ref=ref,
                           escalate_to_human=escalate, confidence=0.8, model_id="m",
                           latency_ms=latency, json_valid_first_try=json_ok, fallback=fallback,
                           model_escalate=escalate if model_escalate is None else model_escalate,
                           total_tokens=50)


def test_normalize_handles_rupee_variants_commas_and_dashes() -> None:
    assert normalize_text("Rs. 1,260 in 7–10 days") == "₹1260 in 7-10 days"
    assert normalize_text("INR 999") == "₹999"


def test_all_facts_hit_is_correct() -> None:
    r = score(q(expected_facts=["7 days"]), resp("You can return within 7 days of delivery."))
    assert r.correct and r.facts_hit == ["7 days"] and not r.violations
    assert r.policy_ref_correct and r.escalation_correct


def test_missing_fact_or_any_group_is_incorrect() -> None:
    r = score(q(expected_facts=["7 days"], expected_any=[["6 months", "6-month"]]),
              resp("Within 7 days."))
    assert not r.correct
    assert "6 months|6-month" in r.facts_missed


def test_forbidden_fact_is_a_violation() -> None:
    r = score(q(expected_facts=["7 days"], forbidden_facts=["30 days"]),
              resp("7 days now, but you have 30 days"))
    assert r.violations == ["30 days"] and not r.correct


def test_escalation_mismatch_and_fallback_json() -> None:
    r = score(q(expected_escalate=True), resp("ok", escalate=False, json_ok=False, fallback=True,
                                              model_escalate=False))
    assert not r.escalation_correct and not r.json_valid and not r.json_valid_final
    assert not r.model_escalation_correct


def test_summary_metrics_and_percentiles() -> None:
    qs = [q(id="a", expected_facts=["7 days"]), q(id="b", expected_facts=["7 days"])]
    results = [score(qs[0], resp("7 days", latency=100)),
               score(qs[1], resp("no idea", latency=300, json_ok=False))]
    s = summarize("m", results, price_per_mtok=1.0)
    assert s.n == 2 and s.factual_accuracy == 0.5 and s.json_validity == 0.5
    assert s.latency_p50_ms == 200 and s.total_tokens == 100
    assert s.est_cost_usd == 100 / 1_000_000
    assert percentile([1, 2, 3, 4], 95) == 3.85
