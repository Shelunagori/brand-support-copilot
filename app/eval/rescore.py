"""Offline re-score of a saved eval report with the current parser. Makes no API calls.

Mirrors the service's path on the *saved* raw outputs: parse the first output; if that fails
and a repair output was recorded, parse it; otherwise fall back. Measured latency and tokens
are carried over unchanged.
"""

from typing import Any

from app.eval.scoring import EvalQuestion, QuestionResult, score
from app.support.guardrails import escalation_triggers
from app.support.parser import ParseError, parse_support_json
from app.support.schema import ModelAnswer, SupportResponse
from app.support.service import FALLBACK_ANSWER

REPAIR_SEP = "\n---repair---\n"


def rescore_result(q: EvalQuestion, saved: dict[str, Any], model_id: str) -> QuestionResult:
    raw: str = saved.get("raw_output") or ""
    attempts = raw.split(REPAIR_SEP)
    parsed: ModelAnswer | None = None
    first_ok = repaired = False
    for i, attempt in enumerate(attempts[:2]):
        try:
            parsed = parse_support_json(attempt)
        except ParseError:
            continue
        first_ok, repaired = i == 0, i == 1
        break
    triggers = escalation_triggers(q.question)
    common: dict[str, Any] = dict(
        model_id=model_id, latency_ms=saved["latency_ms"], total_tokens=saved["total_tokens"],
        json_valid_first_try=first_ok, repaired=repaired, raw_output=raw,
        guardrail_triggers=triggers,
    )
    if parsed is None:
        resp = SupportResponse(intent="other", answer=FALLBACK_ANSWER, policy_ref="UT-ESC-012",
                               escalate_to_human=True, confidence=0.0, fallback=True,
                               error=saved.get("error"), **common)
    else:
        # Nugen's confidence_score was not saved; keep the original value when the answer was
        # valid originally, otherwise use the model's self-reported confidence.
        confidence = parsed.confidence if saved.get("fallback") else saved["confidence"]
        resp = SupportResponse(intent=parsed.intent, answer=parsed.answer,
                               policy_ref=parsed.policy_ref,
                               escalate_to_human=parsed.escalate_to_human or bool(triggers),
                               model_escalate=parsed.escalate_to_human, confidence=confidence,
                               **common)
    return score(q, resp)
