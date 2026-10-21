import logging
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from sqlalchemy import select, text

from app.api.deps import AppServices
from app.config import Settings, get_settings
from app.db import get_session_factory
from app.logging_setup import configure_logging, request_id_var
from app.models import AlignmentRun, RunState
from app.runtime import build_client, build_spend
from app.support.cache import ResponseCache
from app.support.service import SupportService

log = logging.getLogger("app.api")

__all__ = ["AppServices", "create_app"]


async def resolve_aligned_model_id(services: AppServices, settings: Settings) -> str | None:
    if settings.aligned_model_id:
        return settings.aligned_model_id
    async with services.session_factory() as s:
        run = await s.scalar(select(AlignmentRun)
                             .where(AlignmentRun.state == RunState.DEPLOYED)
                             .order_by(AlignmentRun.updated_at.desc()).limit(1))
    return run.model_id if run else None


async def build_services(settings: Settings) -> AppServices:
    redis: Redis = Redis.from_url(settings.redis_url, decode_responses=True)
    sf = get_session_factory()
    nugen = build_client(settings, build_spend(settings))
    recorder = None
    try:
        from app.feedback import InferenceLogger

        recorder = InferenceLogger(sf, settings)
    except ImportError:  # feedback loop module not installed
        pass
    support = SupportService(client=nugen, cache=ResponseCache(redis, settings.cache_ttl_seconds),
                             aligned_model_id=None, base_model_id=settings.nugen_base_model_id,
                             recorder=recorder)
    arq_pool = None
    try:
        from arq import create_pool

        from app.worker import redis_settings

        arq_pool = await create_pool(redis_settings(settings.redis_url))
    except Exception:  # queue is optional for answering traffic
        log.warning("arq.unavailable")
    svc = AppServices(redis=redis, session_factory=sf, support=support, nugen=nugen,
                      arq=arq_pool, recorder=recorder)
    support.aligned_model_id = await resolve_aligned_model_id(svc, settings)
    return svc


def create_app(settings: Settings | None = None, services: AppServices | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        owned = services is None
        app.state.services = services or await build_services(settings)
        log.info("api.started", extra={
            "aligned_model_id": app.state.services.support.aligned_model_id})
        yield
        if owned:
            svc: AppServices = app.state.services
            if svc.nugen:
                await svc.nugen.aclose()
            if svc.arq is not None:
                await svc.arq.aclose()
            await svc.redis.aclose()

    app = FastAPI(title="Brand Support Copilot", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    if services is not None:
        app.state.services = services

    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=False,
        allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_context(request: Request,
                              call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex
        token = request_id_var.set(rid)
        request.state.request_id = rid
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            log.exception("http.unhandled")
            response = JSONResponse({"detail": "internal error", "request_id": rid},
                                    status_code=500)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid
        if request.url.path not in {"/health"}:
            log.info("http.request", extra={
                "request_id": rid, "method": request.method, "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 1)})
        return response

    from app.api import routes_ops, routes_support

    app.include_router(routes_ops.router)
    app.include_router(routes_support.router)
    return app


async def ping(services: AppServices) -> dict[str, str]:
    checks: dict[str, str] = {}
    try:
        async with services.session_factory() as s:
            await s.execute(text("select 1"))
        checks["postgres"] = "ok"
    except Exception as exc:
        checks["postgres"] = f"error: {type(exc).__name__}"
    try:
        await services.redis.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {type(exc).__name__}"
    return checks
