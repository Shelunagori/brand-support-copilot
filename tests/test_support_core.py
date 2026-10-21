import json

import pytest

from app.support.guardrails import escalation_triggers
from app.support.parser import AnswerStreamExtractor, ParseError, parse_support_json


def test_parse_plain_json() -> None:
    raw = json.dumps({"intent": "returns", "answer": "7 days.", "policy_ref": "UT-RET-001",
                      "escalate_to_human": False, "confidence": 0.9})
    out = parse_support_json(raw)
    assert out.policy_ref == "UT-RET-001" and out.confidence == 0.9


def test_parse_json_inside_code_fence_with_chatter() -> None:
    raw = 'Sure!\n```json\n{"intent": "shipping", "answer": "₹79 below ₹999.", ' \
          '"policy_ref": "UT-SHP-005", "escalate_to_human": false, "confidence": 0.8}\n```\nBye'
    assert parse_support_json(raw).intent == "shipping"


def test_parse_coerces_confidence_percent_and_unknown_intent() -> None:
    raw = '{"intent": "weird", "answer": "x", "policy_ref": null, ' \
          '"escalate_to_human": "true", "confidence": 85}'
    out = parse_support_json(raw)
    assert out.intent == "other"
    assert out.escalate_to_human is True
    assert out.confidence == 0.85


@pytest.mark.parametrize("raw", ["", "no json here", '{"answer": ', '{"intent": "returns"}'])
def test_parse_rejects_invalid(raw: str) -> None:
    with pytest.raises(ParseError):
        parse_support_json(raw)


def test_parse_drops_invalid_policy_ref_format() -> None:
    raw = '{"intent": "returns", "answer": "a", "policy_ref": "returns policy", ' \
          '"escalate_to_human": false, "confidence": 0.5}'
    assert parse_support_json(raw).policy_ref is None


def test_answer_stream_extractor_emits_only_answer_text() -> None:
    ex = AnswerStreamExtractor()
    chunks = ['{"intent": "ret', 'urns", "ans', 'wer": "You can ', 'return within 7 ',
              'days \\"unworn\\".", "policy_ref": "UT-RET-001"}']
    out = "".join(ex.feed(c) for c in chunks)
    assert out == 'You can return within 7 days "unworn".'


@pytest.mark.parametrize(
    "query,trigger",
    [
        ("I will send you a legal notice and go to consumer court", "legal_threat"),
        ("I've raised a chargeback with my bank", "chargeback"),
        ("My order of ₹32,000 hasn't arrived", "high_value_order"),
        ("order worth Rs 26000 is late", "high_value_order"),
        ("you idiots are useless", "abusive"),
    ],
)
def test_escalation_triggers(query: str, trigger: str) -> None:
    assert trigger in escalation_triggers(query)


@pytest.mark.parametrize("query", ["What is the return window?", "Order of ₹25,000 refund?",
                                   "Shipping on ₹999 order?"])
def test_no_trigger_for_normal_queries(query: str) -> None:
    assert escalation_triggers(query) == []
