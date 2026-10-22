from collections.abc import AsyncIterator

import httpx
import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.main import AppServices, create_app
from app.config import Settings
from app.support.cache import ResponseCache
from app.support.service import SupportService
from tests.test_support_service import VALID, ScriptedClient

KEY = {"X-API-Key": "test-key"}


@pytest.fixture
async def api(session_factory: async_sessionmaker[AsyncSession]
              ) -> AsyncIterator[tuple[httpx.AsyncClient, ScriptedClient]]:
    redis: Redis = Redis.from_url("redis://localhost:6379/15", decode_responses=True)
    await redis.flushdb()
    model = ScriptedClient([VALID] * 20)
    settings = Settings(client_api_keys="test-key", rate_limit_per_minute=5)
    support = SupportService(client=model, cache=ResponseCache(redis, 60),  # type: ignore[arg-type]
                             aligned_model_id="model_aligned", base_model_id="base")
    app = create_app(settings, AppServices(redis=redis, session_factory=session_factory,
                                           support=support, nugen=None))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://t") as c:
        yield c, model
    await redis.flushdb()
    await redis.aclose()


async def test_health_needs_no_auth(api) -> None:  # type: ignore[no-untyped-def]
    c, _ = api
    r = await c.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


async def test_ready_checks_db_and_redis(api) -> None:  # type: ignore[no-untyped-def]
    c, _ = api
    r = await c.get("/ready")
    assert r.status_code == 200
    assert r.json()["checks"] == {"postgres": "ok", "redis": "ok"}


async def test_query_requires_api_key(api) -> None:  # type: ignore[no-untyped-def]
    c, _ = api
    assert (await c.post("/v1/support/query", json={"query": "hi"})).status_code == 401
    r = await c.post("/v1/support/query", json={"query": "hi"}, headers={"X-API-Key": "bad"})
    assert r.status_code == 401


async def test_query_returns_strict_contract_and_request_id(api) -> None:  # type: ignore[no-untyped-def]
    c, _ = api
    r = await c.post("/v1/support/query", json={"query": "Return window?"},
                     headers={**KEY, "X-Request-ID": "abc-123"})
    assert r.status_code == 200
    body = r.json()
    for field in ("intent", "answer", "policy_ref", "escalate_to_human", "confidence",
                  "model_id", "latency_ms"):
        assert field in body
    assert r.headers["x-request-id"] == "abc-123"
    assert body["request_id"] == "abc-123"


async def test_query_validates_input(api) -> None:  # type: ignore[no-untyped-def]
    c, _ = api
    assert (await c.post("/v1/support/query", json={"query": ""}, headers=KEY)).status_code == 422


async def test_rate_limit_per_api_key(api) -> None:  # type: ignore[no-untyped-def]
    c, _ = api
    codes = [(await c.post("/v1/support/query", json={"query": f"q{i}"}, headers=KEY)).status_code
             for i in range(6)]
    assert codes[:5] == [200] * 5
    assert codes[5] == 429


async def test_stream_endpoint_emits_sse(api) -> None:  # type: ignore[no-untyped-def]
    c, _ = api
    async with c.stream("POST", "/v1/support/stream", json={"query": "Return window?"},
                        headers=KEY) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        text = "".join([chunk async for chunk in r.aiter_text()])
    assert "event: meta" in text and "event: answer_delta" in text and "event: final" in text


async def test_align_job_is_enqueued_once(session_factory) -> None:  # type: ignore[no-untyped-def]
    from arq import create_pool

    from app.worker import redis_settings

    redis: Redis = Redis.from_url("redis://localhost:6379/15", decode_responses=True)
    await redis.flushdb()
    pool = await create_pool(redis_settings("redis://localhost:6379/15"))
    support = SupportService(client=ScriptedClient([]), cache=None,  # type: ignore[arg-type]
                             aligned_model_id=None, base_model_id="base")
    app = create_app(Settings(client_api_keys="test-key"),
                     AppServices(redis=redis, session_factory=session_factory, support=support,
                                 nugen=None, arq=pool))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        first = await c.post("/v1/pipeline/align", json={"confirm": False}, headers=KEY)
        second = await c.post("/v1/pipeline/align", json={"confirm": False}, headers=KEY)
        runs = await c.get("/v1/pipeline/runs", headers=KEY)
    assert first.status_code == 202 and first.json()["status"] == "queued"
    assert second.json()["status"] == "already_queued"
    assert runs.status_code == 200 and runs.json() == []
    await redis.flushdb()
    await pool.aclose()
    await redis.aclose()


async def test_no_aligned_model_returns_safe_fallback(api) -> None:  # type: ignore[no-untyped-def]
    c, _ = api
    r = await c.post("/v1/support/query", json={"query": "hi", "model": "base"}, headers=KEY)
    assert r.json()["model_id"] == "base"


async def test_eval_endpoints(api, session_factory) -> None:  # type: ignore[no-untyped-def]
    from app.models import EvalRun

    c, _ = api
    assert (await c.get("/v1/eval/latest", headers=KEY)).status_code == 404
    async with session_factory() as s:
        s.add(EvalRun(label="x", summary={"base": {}}, report={"label": "x", "questions": []}))
        await s.commit()
    latest = await c.get("/v1/eval/latest", headers=KEY)
    assert latest.status_code == 200 and latest.json()["label"] == "x"
    hist = (await c.get("/v1/eval/history", headers=KEY)).json()
    assert hist[0]["label"] == "x"


async def test_feedback_flow_via_api(api) -> None:  # type: ignore[no-untyped-def]
    from app.config import Settings as S
    from app.feedback import InferenceLogger

    c, model = api
    app_services = c._transport.app.state.services  # type: ignore[attr-defined]
    app_services.support.recorder = InferenceLogger(app_services.session_factory, S())
    c._transport.app.state.settings.rate_limit_per_minute = 100  # type: ignore[attr-defined]
    r = (await c.post("/v1/support/query", json={"query": "Can I exchange socks?"},
                      headers=KEY)).json()
    assert r["inference_id"]
    fb = await c.post("/v1/feedback", headers=KEY, json={
        "inference_id": r["inference_id"], "rating": "down",
        "correction": "Socks cannot be exchanged (UT-NRT-003)."})
    assert fb.status_code == 201 and fb.json()["flagged"]
    flagged = (await c.get("/v1/feedback/flagged", headers=KEY)).json()
    assert flagged[0]["correction"].startswith("Socks")
    assert (await c.get("/v1/feedback/stats", headers=KEY)).json()["thumbs_down"] == 1
    assert (await c.get("/v1/realign/dataset", headers=KEY)).json()["count"] == 1
    too_small = await c.post("/v1/realign", headers=KEY, json={"confirm": False})
    assert too_small.status_code == 409
    bad = await c.post("/v1/feedback", headers=KEY, json={"inference_id": "nope", "rating": "up"})
    assert bad.status_code == 404


async def test_models_reports_aligned_offline(api, session_factory) -> None:  # type: ignore[no-untyped-def]
    from app.models import AlignmentRun, RunState

    c, _ = api
    services = c._transport.app.state.services  # type: ignore[attr-defined]
    services.support.aligned_model_id = None
    async with session_factory() as s:
        s.add(AlignmentRun(name="r", base_model_id="b", docs_hash="h", state=RunState.ALIGNED,
                           model_id="model_x", deployment_status="UNDEPLOYED"))
        await s.commit()
    body = (await c.get("/v1/models", headers=KEY)).json()
    assert body["aligned_available"] is False
    assert body["offline_aligned_model_id"] == "model_x"
    assert "undeployed" in body["aligned_notice"]


async def test_refresh_clears_aligned_model_after_undeploy(api) -> None:  # type: ignore[no-untyped-def]
    c, _ = api
    app = c._transport.app  # type: ignore[attr-defined]
    app.state.services.support.aligned_model_id = "model_gone"
    app.state.model_checked_at = 0.0
    r = (await c.post("/v1/support/query", json={"query": "Return window?"}, headers=KEY)).json()
    assert r["model_kind"] == "base" and r["notice"] == "aligned_offline"
