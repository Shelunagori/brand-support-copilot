from app.eval.rescore import rescore_result
from app.eval.scoring import EvalQuestion

Q = EvalQuestion(id="q1", category="shipping", question="Free shipping on ₹999?",
                 expected_facts=["₹79"], expected_escalate=False,
                 expected_policy_ref="UT-SHP-005")
BARE = ('{"intent": "shipping", "answer": "Orders of ₹999 pay ₹79 shipping.", '
        '"policy_ref": UT-SHP-005, "escalate_to_human": false, "confidence": 0.8}')


def saved(raw: str, fallback: bool = True) -> dict[str, object]:
    return {"raw_output": raw, "fallback": fallback, "latency_ms": 900.0, "total_tokens": 300,
            "confidence": 0.0, "error": "invalid_model_output"}


def test_bare_id_fallback_is_recovered_from_first_attempt() -> None:
    r = rescore_result(Q, saved(f"{BARE}\n---repair---\n{BARE}"), model_id="m")
    assert r.json_valid and r.json_valid_final and not r.fallback
    assert r.correct and r.policy_ref_correct
    assert r.latency_ms == 900.0  # measured latency is kept, never re-estimated


def test_unrecoverable_output_stays_fallback() -> None:
    r = rescore_result(Q, saved("no json\n---repair---\nstill none"), model_id="m")
    assert r.fallback and not r.json_valid_final and r.escalate_to_human


def test_valid_original_is_unchanged() -> None:
    raw = BARE.replace("UT-SHP-005,", '"UT-SHP-005",')
    r = rescore_result(Q, saved(raw, fallback=False) | {"confidence": 0.71}, model_id="m")
    assert r.correct and r.confidence == 0.71
