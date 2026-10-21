"""Pure scoring for the held-out eval set (no I/O)."""

import json
import math
import re
from pathlib import Path
from statistics import mean

from pydantic import BaseModel, Field

from app.support.schema import SupportResponse

_RUPEE = re.compile(r"(?:\brs\.?|\binr|₹)\s*", re.I)
_NUM_COMMA = re.compile(r"(?<=\d),(?=\d{2,3}\b)")
_DASH = re.compile(r"[‐-―−]")
_WS = re.compile(r"\s+")


class EvalQuestion(BaseModel):
    id: str
    category: str
    question: str
    expected_facts: list[str] = Field(default_factory=list)
    expected_any: list[list[str]] = Field(default_factory=list)
    forbidden_facts: list[str] = Field(default_factory=list)
    expected_escalate: bool
    expected_policy_ref: str | None = None
    notes: str | None = None


class QuestionResult(BaseModel):
    question_id: str
    answer: str
    intent: str
    escalate_to_human: bool
    model_escalate: bool | None
    policy_ref: str | None
    confidence: float
    facts_hit: list[str]
    facts_missed: list[str]
    violations: list[str]
    correct: bool
    escalation_correct: bool
    model_escalation_correct: bool
    policy_ref_correct: bool
    json_valid: bool
    json_valid_final: bool
    fallback: bool
    latency_ms: float
    total_tokens: int
    error: str | None = None


class ModelSummary(BaseModel):
    model_id: str
    n: int
    factual_accuracy: float
    policy_violation_rate: float
    escalation_accuracy: float
    model_escalation_accuracy: float
    json_validity: float
    json_validity_final: float
    policy_ref_accuracy: float
    latency_p50_ms: float
    latency_p95_ms: float
    total_tokens: int
    est_cost_usd: float


def load_questions(path: Path) -> list[EvalQuestion]:
    return [EvalQuestion.model_validate(json.loads(line))
            for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def normalize_text(text: str) -> str:
    t = _DASH.sub("-", text.lower())
    t = _RUPEE.sub("₹", t)
    t = _NUM_COMMA.sub("", t)
    return _WS.sub(" ", t).strip()


def _has(haystack: str, needle: str) -> bool:
    return normalize_text(needle) in haystack


def score(q: EvalQuestion, r: SupportResponse) -> QuestionResult:
    text = normalize_text(r.answer)
    hit = [f for f in q.expected_facts if _has(text, f)]
    missed = [f for f in q.expected_facts if not _has(text, f)]
    for group in q.expected_any:
        if any(_has(text, opt) for opt in group):
            hit.append(group[0])
        else:
            missed.append("|".join(group))
    violations = [f for f in q.forbidden_facts if _has(text, f)]
    model_esc = r.model_escalate if r.model_escalate is not None else False
    return QuestionResult(
        question_id=q.id, answer=r.answer, intent=r.intent,
        escalate_to_human=r.escalate_to_human, model_escalate=r.model_escalate,
        policy_ref=r.policy_ref, confidence=r.confidence, facts_hit=hit, facts_missed=missed,
        violations=violations,
        correct=not missed and not violations and not r.fallback,
        escalation_correct=r.escalate_to_human == q.expected_escalate,
        model_escalation_correct=model_esc == q.expected_escalate,
        policy_ref_correct=r.policy_ref == q.expected_policy_ref,
        json_valid=r.json_valid_first_try, json_valid_final=not r.fallback,
        fallback=r.fallback, latency_ms=r.latency_ms, total_tokens=r.total_tokens,
        error=r.error,
    )


def percentile(values: list[float], p: float) -> float:
    """Linear-interpolated percentile (same as numpy's default)."""
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * p / 100
    lo, hi = math.floor(k), math.ceil(k)
    return round(s[lo] + (s[hi] - s[lo]) * (k - lo), 2)


def summarize(model_id: str, results: list[QuestionResult], price_per_mtok: float
              ) -> ModelSummary:
    def rate(attr: str) -> float:
        return round(mean(1.0 if getattr(r, attr) else 0.0 for r in results), 4) if results \
            else 0.0

    lat = [r.latency_ms for r in results]
    tokens = sum(r.total_tokens for r in results)
    return ModelSummary(
        model_id=model_id, n=len(results), factual_accuracy=rate("correct"),
        policy_violation_rate=round(mean(1.0 if r.violations else 0.0 for r in results), 4)
        if results else 0.0,
        escalation_accuracy=rate("escalation_correct"),
        model_escalation_accuracy=rate("model_escalation_correct"),
        json_validity=rate("json_valid"), json_validity_final=rate("json_valid_final"),
        policy_ref_accuracy=rate("policy_ref_correct"),
        latency_p50_ms=percentile(lat, 50), latency_p95_ms=percentile(lat, 95),
        total_tokens=tokens, est_cost_usd=tokens / 1_000_000 * price_per_mtok,
    )
