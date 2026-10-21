import json
from pathlib import Path

import httpx
import pytest
import respx

from app.nugen.client import NugenClient
from app.nugen.errors import NugenAPIError, SpendLimitExceeded
from app.nugen.schemas import ChatMessage

BASE = "https://api.test.nugen"


class RecordingSpend:
    def __init__(self, allow: bool = True) -> None:
        self.allow = allow
        self.records: list[dict[str, object]] = []

    async def ensure_budget(self, endpoint: str) -> None:
        if not self.allow:
            raise SpendLimitExceeded("budget exhausted")

    async def record(self, **kwargs: object) -> None:
        self.records.append(kwargs)


def make_client(spend: RecordingSpend | None = None, **kw: object) -> NugenClient:
    return NugenClient(
        api_key="sk-secret-value",
        base_url=BASE,
        max_retries=kw.pop("max_retries", 3),  # type: ignore[arg-type]
        backoff_base=0.0,
        spend=spend,
    )


@respx.mock
async def test_upload_documents_sends_multipart_and_returns_ids(tmp_path: Path) -> None:
    doc = tmp_path / "returns.md"
    doc.write_text("hello world")
    route = respx.post(f"{BASE}/api/v3/documents/create").mock(
        return_value=httpx.Response(200, json={"document_ids": ["document_1"]})
    )
    async with make_client() as c:
        ids = await c.upload_documents([doc], categories=["policy"])
    assert ids == ["document_1"]
    req = route.calls.last.request
    assert req.headers["authorization"] == "Bearer sk-secret-value"
    body = req.content.decode()
    assert 'name="files"; filename="returns.md"' in body
    assert 'name="categories"' in body


@respx.mock
async def test_get_requests_retry_on_5xx_then_succeed() -> None:
    route = respx.get(f"{BASE}/api/v3/documents/d1/status").mock(
        side_effect=[
            httpx.Response(503, json={"detail": "busy"}),
            httpx.Response(502),
            httpx.Response(200, json={"status": "READY", "document_id": "d1"}),
        ]
    )
    async with make_client() as c:
        st = await c.get_document_status("d1")
    assert st.status == "READY"
    assert route.call_count == 3


@respx.mock
async def test_non_idempotent_post_is_not_retried_on_5xx() -> None:
    route = respx.post(f"{BASE}/api/v3/alignment-projects/create").mock(
        return_value=httpx.Response(500, json={"detail": "boom"})
    )
    async with make_client() as c:
        with pytest.raises(NugenAPIError) as ei:
            await c.create_alignment(
                alignment_name="x", base_model_id="m", document_ids=["d"], benchmark_id=None
            )
    assert route.call_count == 1
    assert ei.value.status_code == 500


@respx.mock
async def test_4xx_raises_with_detail_and_never_leaks_key() -> None:
    respx.get(f"{BASE}/api/v3/models/m1/deployment/status").mock(
        return_value=httpx.Response(404, json={"detail": "model not found"})
    )
    async with make_client() as c:
        with pytest.raises(NugenAPIError) as ei:
            await c.get_deployment_status("m1")
    assert "model not found" in str(ei.value)
    assert "sk-secret-value" not in str(ei.value)
    assert "sk-secret-value" not in repr(c)


@respx.mock
async def test_chat_captures_usage_confidence_and_records_spend() -> None:
    route = respx.post(f"{BASE}/api/v3/inference/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "x",
                "object": "chat.completion",
                "model": "model_1",
                "choices": [
                    {"index": 0, "message": {"role": "assistant", "content": "hi"},
                     "finish_reason": "stop"}
                ],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
                "confidence_score": 91.5,
            },
        )
    )
    spend = RecordingSpend()
    async with make_client(spend) as c:
        res = await c.chat("model_1", [ChatMessage(role="user", content="q")], max_tokens=50)
    assert res.content == "hi"
    assert res.usage.total_tokens == 15
    assert res.confidence_score == 91.5
    assert res.latency_ms >= 0
    sent = json.loads(route.calls.last.request.content)
    assert sent["stream"] is False and sent["model"] == "model_1"
    assert spend.records and spend.records[0]["total_tokens"] == 15


@respx.mock
async def test_chat_blocked_when_budget_exhausted() -> None:
    route = respx.post(f"{BASE}/api/v3/inference/chat/completions")
    async with make_client(RecordingSpend(allow=False)) as c:
        with pytest.raises(SpendLimitExceeded):
            await c.chat("m", [ChatMessage(role="user", content="q")])
    assert route.call_count == 0


@respx.mock
async def test_stream_chat_yields_deltas_confidence_and_usage() -> None:
    lines = [
        'data: {"id":"a","choices":[{"index":0,"delta":{"role":"assistant","content":""},'
        '"finish_reason":null}]}',
        'data: {"id":"a","choices":[{"index":0,"delta":{"content":"Hel"},"finish_reason":null}]}',
        'data: {"object":"confidence","confidence_score":88.0}',
        'data: {"id":"a","choices":[{"index":0,"delta":{"content":"lo"},"finish_reason":"stop"}],'
        '"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
        "data: [DONE]",
    ]
    respx.post(f"{BASE}/api/v3/inference/chat/completions").mock(
        return_value=httpx.Response(200, text="\n\n".join(lines) + "\n\n",
                                    headers={"content-type": "text/event-stream"})
    )
    spend = RecordingSpend()
    events = []
    async with make_client(spend) as c:
        async for ev in c.stream_chat("m", [ChatMessage(role="user", content="q")]):
            events.append(ev)
    text = "".join(e.delta for e in events if e.kind == "delta")
    assert text == "Hello"
    assert any(e.kind == "confidence" and e.confidence == 88.0 for e in events)
    done = [e for e in events if e.kind == "done"]
    assert done and done[0].usage is not None and done[0].usage.total_tokens == 5
    assert spend.records and spend.records[0]["total_tokens"] == 5


@respx.mock
async def test_retry_honours_429_then_succeeds() -> None:
    route = respx.get(f"{BASE}/api/v3/alignment-projects/a1/status").mock(
        side_effect=[
            httpx.Response(429, headers={"retry-after": "0"}),
            httpx.Response(200, json={"alignment_id": "a1", "status": "PROCESSING"}),
        ]
    )
    async with make_client() as c:
        st = await c.get_alignment_status("a1")
    assert st.status == "PROCESSING"
    assert route.call_count == 2
