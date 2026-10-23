from collections.abc import AsyncIterator

import httpx
import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.main import AppServices, create_app
from app.config import Settings, normalize_database_url
from app.demo import DemoBudget
from app.nugen.errors import SpendLimitExceeded
from app.support.service import SupportService
from tests.test_support_service import VALID, ScriptedClient

CODE = {"X-Demo-Code": "open-sesame"}


@pytest.fixture
async def demo(session_factory: async_sessionmaker[AsyncSession]
               ) -> AsyncIterator[tuple[httpx.AsyncClient, Redis]]:
    redis: Redis = Redis.from_url("redis://localhost:6379/15", decode_responses=True)
    await redis.flushdb()
    settings = Settings(demo_mode=True, demo_access_code="open-sesame", demo_daily_cap_usd=1.0,
                        demo_ip_messages_per_hour=3, client_api_keys="admin-key")
    support = SupportService(client=ScriptedClient([VALID] * 20), cache=None,  # type: ignore[arg-type]
                             aligned_model_id=None, base_model_id="base")
    budget = DemoBudget(redis, price_per_mtok_usd=38.0, daily_cap_usd=1.0)
    app = create_app(settings, AppServices(redis=redis, session_factory=session_factory,
                                           support=support, nugen=None, demo_budget=budget))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://t") as c:
        yield c, redis
    await redis.flushdb()
    await redis.aclose()


async def test_reads_are_public_in_demo_mode(demo) -> None:  # type: ignore[no-untyped-def]
    c, _ = demo
    for path in ("/v1/models", "/v1/pipeline/runs", "/v1/eval/history", "/v1/feedback/stats",
                 "/v1/feedback/flagged", "/v1/realign/dataset", "/v1/spend"):
        assert (await c.get(path)).status_code == 200, path


@pytest.mark.parametrize("method,path,body", [
    ("POST", "/v1/pipeline/align", {"confirm": False}),
    ("POST", "/v1/pipeline/deploy", None),
    ("POST", "/v1/realign", {"confirm": False}),
    ("POST", "/v1/feedback", {"inference_id": "x", "rating": "up"}),
])
async def test_paid_and_admin_endpoints_are_disabled(demo, method, path, body) -> None:  # type: ignore[no-untyped-def]
    c, _ = demo
    # even a valid admin API key cannot use them in demo mode
    r = await c.request(method, path, json=body, headers={"X-API-Key": "admin-key", **CODE})
    assert r.status_code == 403 and r.json()["detail"] == "disabled in demo"


async def test_chat_requires_the_access_code(demo) -> None:  # type: ignore[no-untyped-def]
    c, _ = demo
    q = {"query": "Return window?"}
    assert (await c.post("/v1/support/query", json=q)).status_code == 401
    bad = await c.post("/v1/support/query", json=q, headers={"X-Demo-Code": "nope"})
    assert bad.status_code == 401 and bad.json()["detail"] == "invalid access code"
    ok = await c.post("/v1/support/query", json=q, headers=CODE)
    assert ok.status_code == 200 and ok.json()["notice"] == "aligned_offline"


async def test_verify_endpoint(demo) -> None:  # type: ignore[no-untyped-def]
    c, _ = demo
    assert (await c.post("/v1/demo/verify", json={"code": "open-sesame"})).status_code == 200
    assert (await c.post("/v1/demo/verify", json={"code": "wrong"})).status_code == 401


async def test_per_ip_hourly_limit(demo) -> None:  # type: ignore[no-untyped-def]
    c, _ = demo
    codes = [(await c.post("/v1/support/query", json={"query": f"q{i}"}, headers=CODE))
             .status_code for i in range(4)]
    assert codes == [200, 200, 200, 429]
    r = await c.post("/v1/support/query", json={"query": "q"}, headers=CODE)
    assert r.json()["detail"] == "ip_rate_limited"


async def test_daily_cap_blocks_chat_and_shows_in_status(demo) -> None:  # type: ignore[no-untyped-def]
    c, redis = demo
    status = (await c.get("/v1/demo/status")).json()
    assert status["demo_mode"] is True and status["limit_reached"] is False
    assert status["access_code_required"] is True and status["ip_limit_per_hour"] == 3
    budget = DemoBudget(redis, price_per_mtok_usd=38.0, daily_cap_usd=1.0)
    await budget.record(endpoint="chat", total_tokens=30_000)  # 30k * $38/1M = $1.14
    r = await c.post("/v1/support/query", json={"query": "q"}, headers=CODE)
    assert r.status_code == 429 and r.json()["detail"] == "demo_daily_limit"
    assert (await c.get("/v1/demo/status")).json()["limit_reached"] is True


async def test_demo_budget_is_a_spend_guard(session_factory) -> None:  # type: ignore[no-untyped-def]
    redis: Redis = Redis.from_url("redis://localhost:6379/15", decode_responses=True)
    await redis.flushdb()
    b = DemoBudget(redis, price_per_mtok_usd=38.0, daily_cap_usd=0.05)
    await b.ensure_budget("chat")
    await b.record(endpoint="chat", total_tokens=1_000)
    assert await b.spent_today() == pytest.approx(0.038)
    await b.record(endpoint="chat", total_tokens=1_000)
    with pytest.raises(SpendLimitExceeded):
        await b.ensure_budget("chat")
    await redis.flushdb()
    await redis.aclose()


async def test_demo_without_configured_code_fails_closed(session_factory) -> None:  # type: ignore[no-untyped-def]
    redis: Redis = Redis.from_url("redis://localhost:6379/15", decode_responses=True)
    support = SupportService(client=ScriptedClient([VALID]), cache=None,  # type: ignore[arg-type]
                             aligned_model_id=None, base_model_id="base")
    app = create_app(Settings(demo_mode=True, demo_access_code=""),
                     AppServices(redis=redis, session_factory=session_factory, support=support,
                                 nugen=None, demo_budget=DemoBudget(redis, 38.0, 1.0)))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post("/v1/support/query", json={"query": "q"}, headers={"X-Demo-Code": ""})
    assert r.status_code == 503
    await redis.aclose()


async def test_non_demo_mode_still_requires_api_key(api) -> None:  # type: ignore[no-untyped-def]
    c, _ = api
    assert (await c.get("/v1/pipeline/runs")).status_code == 401
    assert (await c.get("/v1/demo/status")).json()["demo_mode"] is False


@pytest.mark.parametrize("raw,expected", [
    ("postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
     "&channel_binding=require",
     "postgresql+asyncpg://u:p@ep-x.ap-southeast-1.aws.neon.tech/neondb?ssl=require"),
    ("postgres://u:p@h:5432/db", "postgresql+asyncpg://u:p@h:5432/db"),
    ("postgresql+asyncpg://copilot:copilot@localhost:5432/copilot",
     "postgresql+asyncpg://copilot:copilot@localhost:5432/copilot"),
])
def test_normalize_database_url(raw: str, expected: str) -> None:
    assert normalize_database_url(raw) == expected
    assert Settings(database_url=raw).database_url == expected


async def test_eval_run_detail_endpoint(api, session_factory) -> None:  # type: ignore[no-untyped-def]
    from app.models import EvalRun

    c, _ = api
    async with session_factory() as s:
        run = EvalRun(label="exp", summary={}, report={"label": "exp", "questions": []})
        s.add(run)
        await s.commit()
    r = await c.get(f"/v1/eval/runs/{run.id}", headers={"X-API-Key": "test-key"})
    assert r.status_code == 200 and r.json()["label"] == "exp"
    missing = await c.get("/v1/eval/runs/00000000-0000-0000-0000-000000000000",
                          headers={"X-API-Key": "test-key"})
    assert missing.status_code == 404


async def test_latest_eval_prefers_real_runs_over_offline_rescores(api, session_factory) -> None:  # type: ignore[no-untyped-def]
    from datetime import UTC, datetime

    from app.models import EvalRun

    c, _ = api
    async with session_factory() as s:
        s.add(EvalRun(label="exp3", summary={}, report={"label": "exp3"},
                      created_at=datetime(2026, 10, 22, 14, 19, tzinfo=UTC)))
        s.add(EvalRun(label="exp3 re-score", summary={},
                      report={"label": "exp3 re-score", "rescored_from": "x.json"},
                      created_at=datetime(2026, 10, 22, 14, 24, tzinfo=UTC)))
        await s.commit()
    assert (await c.get("/v1/eval/latest", headers={"X-API-Key": "test-key"})).json()["label"] \
        == "exp3"


async def test_demo_models_notice_does_not_mention_make(demo) -> None:  # type: ignore[no-untyped-def]
    from app.models import AlignmentRun, RunState

    c, _ = demo
    services = c._transport.app.state.services  # type: ignore[attr-defined]
    async with services.session_factory() as s:
        s.add(AlignmentRun(name="r", base_model_id="b", docs_hash="h", state=RunState.ALIGNED,
                           model_id="model_x", deployment_status="UNDEPLOYED"))
        await s.commit()
    notice = (await c.get("/v1/models")).json()["aligned_notice"]
    assert "make" not in notice and "undeployed to save credits" in notice


async def test_lifetime_cap_blocks_even_on_a_fresh_day(session_factory) -> None:  # type: ignore[no-untyped-def]
    redis: Redis = Redis.from_url("redis://localhost:6379/15", decode_responses=True)
    await redis.flushdb()
    b = DemoBudget(redis, price_per_mtok_usd=38.0, daily_cap_usd=1.0, total_cap_usd=2.0)
    await b.record(endpoint="chat", total_tokens=40_000)  # $1.52 today, $1.52 total
    assert await b.limit_reason() == "daily"
    await redis.delete(DemoBudget.key())  # simulate a new day
    assert await b.limit_reason() is None
    await b.record(endpoint="chat", total_tokens=20_000)  # +$0.76 -> $2.28 total
    assert await b.limit_reason() == "total"
    with pytest.raises(SpendLimitExceeded):
        await b.ensure_budget("chat")
    await redis.flushdb()
    await redis.aclose()


def test_public_dev_key_is_never_valid_on_a_hosted_platform(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    # Render sets RENDER=true. A deploy that forgot DEMO_MODE / CLIENT_API_KEYS must not fall
    # back to the dev key that is published in the repo.
    monkeypatch.setenv("RENDER", "true")
    assert Settings(client_api_keys="dev-key-change-me").api_keys == set()
    assert Settings(client_api_keys="dev-key-change-me,real-k").api_keys == {"real-k"}
    monkeypatch.delenv("RENDER")
    assert Settings(client_api_keys="dev-key-change-me").api_keys == {"dev-key-change-me"}


async def test_hosted_misconfig_rejects_dev_key_over_http(monkeypatch, session_factory) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("RENDER", "true")
    redis: Redis = Redis.from_url("redis://localhost:6379/15", decode_responses=True)
    support = SupportService(client=ScriptedClient([VALID]), cache=None,  # type: ignore[arg-type]
                             aligned_model_id=None, base_model_id="base")
    app = create_app(Settings(demo_mode=False, client_api_keys="dev-key-change-me"),
                     AppServices(redis=redis, session_factory=session_factory, support=support,
                                 nugen=None))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/v1/pipeline/runs", headers={"X-API-Key": "dev-key-change-me"})
    assert r.status_code == 401
    await redis.aclose()


async def test_history_exposes_base_model_and_rescore_flag(api, session_factory) -> None:  # type: ignore[no-untyped-def]
    from app.models import EvalRun

    c, _ = api
    async with session_factory() as s:
        s.add(EvalRun(label="a", summary={"base": {"model_id": "Qwen/0.5B"},
                                          "aligned": {"model_id": "m1"}}, report={}))
        s.add(EvalRun(label="b", summary={"base": {"model_id": "Llama/3B"}},
                      report={"rescored_from": "x.json"}))
        await s.commit()
    hist = (await c.get("/v1/eval/history", headers={"X-API-Key": "test-key"})).json()
    by = {h["label"]: h for h in hist}
    assert by["a"]["base_model_id"] == "Qwen/0.5B" and by["a"]["rescored"] is False
    assert by["b"]["base_model_id"] == "Llama/3B" and by["b"]["rescored"] is True


async def test_spend_reports_billed_total_cap_and_demo_caps(demo) -> None:  # type: ignore[no-untyped-def]
    from app.models import SpendEntry

    c, _ = demo
    sf = c._transport.app.state.services.session_factory  # type: ignore[attr-defined]
    async with sf() as s:
        s.add(SpendEntry(endpoint="chat", est_cost_usd=30.0))
        s.add(SpendEntry(endpoint="(billing reconciliation)", purpose="reconciliation",
                         est_cost_usd=-8.96, note="billing"))
        await s.commit()
    body = (await c.get("/v1/spend")).json()
    assert body["total_est_usd"] == pytest.approx(21.04)
    assert body["billed_total_usd"] == pytest.approx(21.04)
    assert body["last_reconciled_at"] is not None
    assert body["hard_limit_usd"] == 45.0
    assert body["demo"]["daily_cap_usd"] == 1.0 and body["demo"]["total_cap_usd"] == 1.25


class FakeNugenDeploy:
    def __init__(self) -> None:
        self.undeployed: list[str] = []

    async def undeploy_model(self, model_id: str) -> str:
        self.undeployed.append(model_id)
        return "Undeployment started"


async def test_lifetime_cap_auto_undeploys_aligned_and_falls_back_to_base(session_factory) -> None:  # type: ignore[no-untyped-def]
    from app.api.main import resolve_aligned_model_id
    from app.models import AlignmentRun, RunState

    redis: Redis = Redis.from_url("redis://localhost:6379/15", decode_responses=True)
    await redis.flushdb()
    async with session_factory() as s:
        s.add(AlignmentRun(name="r", base_model_id="b", docs_hash="h", state=RunState.DEPLOYED,
                           model_id="model_live"))
        await s.commit()
    settings = Settings(demo_mode=True, demo_access_code="open-sesame", demo_total_cap_usd=0.01)
    budget = DemoBudget(redis, 38.0, daily_cap_usd=1.0, total_cap_usd=0.01)
    nugen = FakeNugenDeploy()
    support = SupportService(client=ScriptedClient([VALID] * 5), cache=None,  # type: ignore[arg-type]
                             aligned_model_id="model_live", base_model_id="base")
    svc = AppServices(redis=redis, session_factory=session_factory, support=support,
                      nugen=nugen, demo_budget=budget)  # type: ignore[arg-type]
    app = create_app(settings, svc)
    await budget.record(endpoint="chat", total_tokens=1_000)  # $0.038 > $0.01 lifetime cap
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post("/v1/support/query", json={"query": "q"}, headers=CODE)
        assert r.status_code == 429 and r.json()["detail"] == "demo_daily_limit"
        await c.get("/v1/demo/status")  # a second trigger must not undeploy twice
    assert nugen.undeployed == ["model_live"]
    assert support.aligned_model_id is None
    # the DB still says DEPLOYED, but the Redis kill switch wins
    assert await resolve_aligned_model_id(svc, settings) is None
    await redis.flushdb()
    await redis.aclose()
