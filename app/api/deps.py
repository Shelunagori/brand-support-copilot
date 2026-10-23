import hashlib
import secrets
import time
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.demo import DemoBudget, enforce_lifetime_cap, hit_hourly_limit
from app.nugen.client import NugenClient
from app.support.service import SupportService


@dataclass
class AppServices:
    redis: Redis
    session_factory: async_sessionmaker[AsyncSession]
    support: SupportService
    nugen: NugenClient | None
    arq: Any = None  # arq ArqRedis pool (optional; alignment jobs)
    recorder: Any = None  # InferenceLogger (phase 4)
    demo_budget: DemoBudget | None = None  # public demo: Redis daily spend cap


def services(request: Request) -> AppServices:
    svc: AppServices = request.app.state.services
    return svc


def settings(request: Request) -> Settings:
    s: Settings = request.app.state.settings
    return s


async def require_api_key(
    request: Request,
    x_api_key: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    key = x_api_key
    if not key and authorization and authorization.lower().startswith("bearer "):
        key = authorization[7:].strip()
    valid = settings(request).api_keys
    if not key or not any(secrets.compare_digest(key, v) for v in valid):
        raise HTTPException(status_code=401, detail="missing or invalid API key",
                            headers={"WWW-Authenticate": "ApiKey"})
    return key


async def rate_limit(request: Request, key: Annotated[str, Depends(require_api_key)]) -> str:
    """Fixed one-minute window per API key (Redis INCR + EXPIRE)."""
    limit = settings(request).rate_limit_per_minute
    window = int(time.time() // 60)
    ident = hashlib.sha256(key.encode()).hexdigest()[:16]
    rkey = f"ratelimit:{ident}:{window}"
    r = services(request).redis
    count = await r.incr(rkey)
    if count == 1:
        await r.expire(rkey, 65)
    request.state.rate_limit_remaining = max(limit - count, 0)
    if count > limit:
        retry_after = 60 - int(time.time() % 60)
        raise HTTPException(status_code=429, detail="rate limit exceeded",
                            headers={"Retry-After": str(retry_after)})
    return key


def client_ip(request: Request) -> str:
    # uvicorn runs with --proxy-headers, so this is the real client behind Render's proxy
    return request.client.host if request.client else "unknown"


async def _key_auth(request: Request, x_api_key: str | None, authorization: str | None) -> str:
    key = await require_api_key(request, x_api_key, authorization)
    return await rate_limit(request, key)


async def read_access(
    request: Request,
    x_api_key: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """Read-only screens: public in demo mode, API key otherwise."""
    if settings(request).demo_mode:
        return "demo"
    return await _key_auth(request, x_api_key, authorization)


async def chat_access(
    request: Request,
    x_api_key: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
    x_demo_code: Annotated[str | None, Header()] = None,
) -> str:
    """Live model calls. Demo mode: access code + daily spend cap + per-IP hourly limit."""
    cfg = settings(request)
    if not cfg.demo_mode:
        return await _key_auth(request, x_api_key, authorization)
    expected = cfg.demo_access_code.get_secret_value()
    if not expected:
        raise HTTPException(503, "demo access code is not configured")
    if not x_demo_code or not secrets.compare_digest(x_demo_code, expected):
        raise HTTPException(401, "invalid access code")
    svc = services(request)
    await enforce_lifetime_cap(svc.redis, svc.demo_budget, svc.support, svc.nugen)
    if svc.demo_budget is not None and await svc.demo_budget.limit_reached():
        raise HTTPException(429, "demo_daily_limit")
    if await hit_hourly_limit(svc.redis, "ip", client_ip(request),
                              cfg.demo_ip_messages_per_hour):
        raise HTTPException(429, "ip_rate_limited", headers={"Retry-After": "3600"})
    return "demo"


async def admin_access(
    request: Request,
    x_api_key: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """Paid or state-changing actions: never available in the public demo."""
    if settings(request).demo_mode:
        raise HTTPException(403, "disabled in demo")
    return await _key_auth(request, x_api_key, authorization)


Authed = Annotated[str, Depends(rate_limit)]
ReadAuthed = Annotated[str, Depends(read_access)]
ChatAuthed = Annotated[str, Depends(chat_access)]
AdminAuthed = Annotated[str, Depends(admin_access)]
Services = Annotated[AppServices, Depends(services)]
