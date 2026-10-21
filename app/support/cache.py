import hashlib
import re
import unicodedata

from redis.asyncio import Redis

from app.support.schema import SupportResponse

_PUNCT = re.compile(r"[^\w\s₹]", re.U)
_WS = re.compile(r"\s+")


def normalize_query(q: str) -> str:
    q = unicodedata.normalize("NFKC", q).lower()
    q = _PUNCT.sub("", q)
    return _WS.sub(" ", q).strip()


class ResponseCache:
    PREFIX = "cache:support:v1:"

    def __init__(self, redis: Redis, ttl_seconds: int) -> None:
        self._r = redis
        self._ttl = ttl_seconds

    def key(self, model_id: str, query: str) -> str:
        digest = hashlib.sha256(f"{model_id}\x00{normalize_query(query)}".encode()).hexdigest()
        return self.PREFIX + digest

    async def get(self, model_id: str, query: str) -> SupportResponse | None:
        raw = await self._r.get(self.key(model_id, query))
        return SupportResponse.model_validate_json(raw) if raw else None

    async def set(self, model_id: str, query: str, resp: SupportResponse) -> None:
        await self._r.set(self.key(model_id, query), resp.model_dump_json(), ex=self._ttl)

    async def clear(self) -> int:
        n = 0
        async for k in self._r.scan_iter(match=self.PREFIX + "*"):
            n += await self._r.delete(k)
        return n
