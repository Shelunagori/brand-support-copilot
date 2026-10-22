import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

Intent = Literal[
    "returns", "exchange", "refund", "shipping", "delivery", "warranty", "marketplace",
    "damaged_item", "gst_invoice", "cancellation", "order_status", "payment", "escalation",
    "other",
]
INTENTS: tuple[str, ...] = Intent.__args__  # type: ignore[attr-defined]
POLICY_REF_RE = re.compile(r"^UT-[A-Z]{3}-\d{3}$")


class ModelAnswer(BaseModel):
    """What the model must emit. Lenient coercion; anything unrecoverable is a ParseError."""

    intent: Intent
    answer: str = Field(min_length=1, max_length=4000)
    policy_ref: str | None = None
    escalate_to_human: bool
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)

    @field_validator("intent", mode="before")
    @classmethod
    def _intent(cls, v: Any) -> Any:
        v = str(v).strip().lower().replace(" ", "_").replace("-", "_") if v is not None else v
        return v if v in INTENTS else "other"

    @field_validator("policy_ref", mode="before")
    @classmethod
    def _policy_ref(cls, v: Any) -> str | None:
        if not isinstance(v, str):
            return None
        v = v.strip().upper()
        return v if POLICY_REF_RE.match(v) else None

    @field_validator("confidence", mode="before")
    @classmethod
    def _confidence(cls, v: Any) -> Any:
        try:
            f = float(v)
        except (TypeError, ValueError):
            return 0.5
        if f > 1:
            f = f / 100
        return min(max(f, 0.0), 1.0)


class SupportQuery(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    model: Literal["aligned", "base"] = "aligned"
    use_cache: bool = True


class SupportResponse(BaseModel):
    intent: Intent
    answer: str
    policy_ref: str | None
    escalate_to_human: bool
    confidence: float
    model_id: str
    latency_ms: float
    model_kind: Literal["aligned", "base"] = "aligned"
    request_id: str | None = None
    cached: bool = False
    repaired: bool = False
    fallback: bool = False
    json_valid_first_try: bool = True
    guardrail_triggers: list[str] = Field(default_factory=list)
    # The model's own escalation decision, before guardrails (None when it gave no valid JSON).
    model_escalate: bool | None = None
    error: str | None = None
    # e.g. "aligned_offline": aligned was requested but none is deployed, base answered
    notice: str | None = None
    total_tokens: int = 0
    inference_id: str | None = None
    raw_output: str | None = Field(default=None, exclude=True)
