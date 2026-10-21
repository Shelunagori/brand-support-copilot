import hashlib
import secrets
import time
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
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


Authed = Annotated[str, Depends(rate_limit)]
Services = Annotated[AppServices, Depends(services)]
