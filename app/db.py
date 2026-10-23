from functools import lru_cache
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    pass


@lru_cache
def engine_kwargs(url: str) -> dict[str, Any]:
    """Neon's pooled endpoint (PgBouncer, transaction mode) can't keep asyncpg's prepared
    statements; disable the statement cache there."""
    kw: dict[str, Any] = {"pool_pre_ping": True}
    if "-pooler." in url:
        kw["connect_args"] = {"statement_cache_size": 0}
    return kw


def get_engine() -> AsyncEngine:
    url = get_settings().database_url
    return create_async_engine(url, **engine_kwargs(url))


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)
