import json
from collections.abc import AsyncIterator, Sequence
from typing import Any

import pytest
from redis.asyncio import Redis

from app.nugen.schemas import ChatMessage, ChatResult, StreamEvent, Usage
from app.support.cache import ResponseCache, normalize_query
from app.support.service import SupportService

VALID = json.dumps({"intent": "returns", "answer": "Return within 7 days of delivery, unworn "
                    "with tags.", "policy_ref": "UT-RET-001", "escalate_to_human": False,
                    "confidence": 0.9})


class ScriptedClient:
    def __init__(self, replies: list[str], confidence: float | None = None) -> None:
        self.replies = replies
        self.calls: list[list[ChatMessage]] = []
        self.confidence = confidence

    async def chat(self, model: str, messages: Sequence[ChatMessage], **kw: Any) -> ChatResult:
        self.calls.append(list(messages))
        content = self.replies.pop(0)
        return ChatResult(content=content, model=model, usage=Usage(total_tokens=10),
                          confidence_score=self.confidence, latency_ms=12.0)

    async def stream_chat(self, model: str, messages: Sequence[ChatMessage], **kw: Any
                          ) -> AsyncIterator[StreamEvent]:
        self.calls.append(list(messages))
        content = self.replies.pop(0)
        for i in range(0, len(content), 7):
            yield StreamEvent(kind="delta", delta=content[i:i + 7])
        yield StreamEvent(kind="done", usage=Usage(total_tokens=10), latency_ms=5.0)


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    r: Redis = Redis.from_url("redis://localhost:6379/15", decode_responses=True)
    await r.flushdb()
    yield r
    await r.flushdb()
    await r.aclose()


def make_service(client: ScriptedClient, redis: Redis) -> SupportService:
    return SupportService(client=client, cache=ResponseCache(redis, ttl_seconds=60),  # type: ignore[arg-type]
                          aligned_model_id="model_aligned", base_model_id="base")


def test_normalize_query_is_stable() -> None:
    expected = normalize_query("whats the return window")
    assert normalize_query("  What's the RETURN window?? ") == expected


async def test_valid_answer_passes_through(redis: Redis) -> None:
    svc = make_service(ScriptedClient([VALID], confidence=72.0), redis)
    out = await svc.answer("Return window?")
    assert out.policy_ref == "UT-RET-001"
    assert out.model_id == "model_aligned"
    assert out.confidence == pytest.approx(0.72)  # Nugen confidence_score wins when present
    assert not out.repaired and not out.fallback


async def test_invalid_output_is_repaired_once(redis: Redis) -> None:
    client = ScriptedClient(["Sure, returns are 7 days", VALID])
    out = await make_service(client, redis).answer("Return window?")
    assert out.repaired and not out.fallback
    assert len(client.calls) == 2
    assert "not valid JSON" in client.calls[1][-1].content


async def test_two_invalid_outputs_fall_back_to_escalation(redis: Redis) -> None:
    client = ScriptedClient(["nope", "still nope"])
    out = await make_service(client, redis).answer("Return window?")
    assert out.fallback and out.escalate_to_human
    assert out.intent == "other"
    assert len(client.calls) == 2


async def test_guardrail_forces_escalation(redis: Redis) -> None:
    out = await make_service(ScriptedClient([VALID]), redis).answer(
        "I'm filing a chargeback on my ₹32,000 order")
    assert out.escalate_to_human
    assert {"chargeback", "high_value_order"} <= set(out.guardrail_triggers)


async def test_cache_hit_skips_model(redis: Redis) -> None:
    client = ScriptedClient([VALID])
    svc = make_service(client, redis)
    first = await svc.answer("Return window?")
    second = await svc.answer("  return WINDOW ")
    assert len(client.calls) == 1
    assert second.cached and not first.cached
    assert second.answer == first.answer


async def test_base_model_kind_uses_base_model(redis: Redis) -> None:
    out = await make_service(ScriptedClient([VALID]), redis).answer("q", model_kind="base")
    assert out.model_id == "base"


async def test_stream_emits_answer_deltas_then_final(redis: Redis) -> None:
    svc = make_service(ScriptedClient([VALID]), redis)
    events = [e async for e in svc.stream("Return window?")]
    kinds = [e["event"] for e in events]
    assert kinds[0] == "meta" and kinds[-1] == "final"
    answer = "".join(json.loads(e["data"])["text"] for e in events if e["event"] == "answer_delta")
    assert answer.startswith("Return within 7 days")
    final = json.loads(events[-1]["data"])
    assert final["policy_ref"] == "UT-RET-001"
