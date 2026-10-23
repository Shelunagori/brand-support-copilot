import os
from collections.abc import AsyncIterator

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://copilot:copilot@localhost:5432/copilot_test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("CLIENT_API_KEYS", "test-key")
# Unit tests never talk to the real API; the live suite reads the key from .env explicitly.
os.environ["NUGEN_API_KEY"] = "test-nugen-key"

from app.db import Base  # noqa: E402


@pytest.fixture(scope="session")
async def engine() -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(os.environ["DATABASE_URL"])
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def session_factory(engine: AsyncEngine) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
    yield async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
async def api(session_factory: async_sessionmaker[AsyncSession]):  # type: ignore[no-untyped-def]
    """Non-demo app with a scripted model; yields (client, scripted model)."""
    import httpx
    from redis.asyncio import Redis

    from app.api.main import AppServices, create_app
    from app.config import Settings
    from app.support.cache import ResponseCache
    from app.support.service import SupportService
    from tests.test_support_service import VALID, ScriptedClient

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
