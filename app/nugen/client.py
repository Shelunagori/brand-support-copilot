"""Async, typed client for the Nugen v3 API.

Retry policy:
- Reads (GET) and inference retry on transport errors, 429 and 5xx with exponential backoff
  (Retry-After honoured).
- State-creating POSTs (upload, create alignment, deploy) only retry when the connection was
  never established, so a retry can never create a duplicate resource.
"""

import asyncio
import contextlib
import json
import logging
import random
import time
from collections.abc import AsyncIterator, Sequence
from pathlib import Path
from types import TracebackType
from typing import Any, Protocol, Self

import httpx

from app.nugen.errors import NugenAPIError, NugenError
from app.nugen.schemas import (
    AlignedModel,
    AlignmentDetail,
    AlignmentStatus,
    BaseModelInfo,
    BenchmarkStatus,
    BenchmarkUpload,
    ChatMessage,
    ChatResult,
    DeploymentStatus,
    DocumentStatus,
    StreamEvent,
    Usage,
)

log = logging.getLogger(__name__)

CHAT_PATH = "/api/v3/inference/chat/completions"
_SAFE_TO_RETRY_ANY = (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout)
_RETRYABLE_TRANSPORT = (httpx.TransportError,)


class SpendGuard(Protocol):
    async def ensure_budget(self, endpoint: str) -> None: ...

    async def record(
        self,
        *,
        endpoint: str,
        model: str | None = None,
        purpose: str | None = None,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
        latency_ms: float | None = None,
        note: str | None = None,
        est_cost_usd: float | None = None,
    ) -> None: ...


def _detail(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        return resp.text[:500] or resp.reason_phrase
    if isinstance(body, dict) and "detail" in body:
        return json.dumps(body["detail"]) if not isinstance(body["detail"], str) else body["detail"]
    return json.dumps(body)[:500]


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


class NugenClient:
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.nugen.in",
        *,
        timeout_s: float = 60.0,
        max_retries: int = 3,
        backoff_base: float = 0.5,
        spend: SpendGuard | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not api_key:
            raise NugenError("NUGEN_API_KEY is not set (put it in .env)")
        self._http = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(timeout_s, connect=10.0),
            transport=transport,
        )
        self._max_retries = max_retries
        self._backoff_base = backoff_base
        self._spend = spend

    def __repr__(self) -> str:
        return f"NugenClient(base_url={str(self._http.base_url)!r}, api_key=***)"

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self, *exc: tuple[type[BaseException], BaseException, TracebackType]
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()

    # ------------------------------------------------------------------ transport

    async def _sleep_for(self, attempt: int, resp: httpx.Response | None) -> None:
        delay = self._backoff_base * (2**attempt) + random.uniform(0, self._backoff_base)
        if resp is not None and (ra := resp.headers.get("retry-after")):
            with contextlib.suppress(ValueError):
                delay = float(ra)
        await asyncio.sleep(delay)

    async def _request(
        self, method: str, path: str, *, idempotent: bool, op: str, **kwargs: Any
    ) -> httpx.Response:
        attempt = 0
        while True:
            resp: httpx.Response | None = None
            try:
                resp = await self._http.request(method, path, **kwargs)
            except _RETRYABLE_TRANSPORT as exc:
                can_retry = idempotent or isinstance(exc, _SAFE_TO_RETRY_ANY)
                if not can_retry or attempt >= self._max_retries:
                    raise NugenError(f"{op} transport error: {type(exc).__name__}") from exc
                log.warning("nugen.retry", extra={"op": op, "attempt": attempt,
                                                   "error": type(exc).__name__})
            else:
                if resp.status_code < 400:
                    return resp
                err = NugenAPIError(resp.status_code, _detail(resp), op)
                if not (idempotent and err.retryable) or attempt >= self._max_retries:
                    raise err
                log.warning("nugen.retry", extra={"op": op, "attempt": attempt,
                                                   "status": resp.status_code})
            await self._sleep_for(attempt, resp)
            attempt += 1

    async def _get(self, path: str, op: str, **kwargs: Any) -> Any:
        return (await self._request("GET", path, idempotent=True, op=op, **kwargs)).json()

    # ------------------------------------------------------------------ documents

    async def upload_documents(
        self,
        paths: Sequence[Path],
        categories: list[str] | None = None,
        names: list[str] | None = None,
    ) -> list[str]:
        files = [("files", (p.name, await asyncio.to_thread(p.read_bytes), "text/markdown"))
                 for p in paths]
        data: dict[str, Any] = {}
        if categories:
            data["categories"] = categories
        if names:
            data["names"] = names
        resp = await self._request("POST", "/api/v3/documents/create", idempotent=False,
                                   op="upload_documents", files=files, data=data)
        ids: list[str] = resp.json()["document_ids"]
        return ids

    async def get_document_status(self, document_id: str) -> DocumentStatus:
        return DocumentStatus.model_validate(
            await self._get(f"/api/v3/documents/{document_id}/status", "document_status")
        )

    # ------------------------------------------------------------------ benchmarks

    async def upload_benchmark(
        self, path: Path, document_id: str, name: str, description: str | None = None
    ) -> BenchmarkUpload:
        data = {"document_id": document_id, "name": name}
        if description:
            data["description"] = description
        resp = await self._request(
            "POST", "/api/v3/benchmarks/upload", idempotent=False, op="upload_benchmark",
            files={"file": (path.name, await asyncio.to_thread(path.read_bytes),
                            "application/json")}, data=data,
        )
        return BenchmarkUpload.model_validate(resp.json())

    async def get_benchmark_status(self, benchmark_id: str) -> BenchmarkStatus:
        return BenchmarkStatus.model_validate(
            await self._get(f"/api/v3/benchmarks/{benchmark_id}/status", "benchmark_status")
        )

    # ------------------------------------------------------------------ alignment

    async def create_alignment(
        self,
        *,
        alignment_name: str,
        base_model_id: str,
        document_ids: list[str],
        benchmark_id: str | None,
        description: str | None = None,
    ) -> AlignmentStatus:
        if self._spend:
            await self._spend.ensure_budget("alignment-projects/create")
        body: dict[str, Any] = {
            "alignment_name": alignment_name,
            "base_model_id": base_model_id,
            "document_ids": document_ids,
        }
        if benchmark_id:
            body["benchmark_id"] = benchmark_id
        if description:
            body["description"] = description
        resp = await self._request("POST", "/api/v3/alignment-projects/create",
                                   idempotent=False, op="create_alignment", json=body)
        result = AlignmentStatus.model_validate(resp.json())
        if self._spend:
            await self._spend.record(endpoint="alignment-projects/create", model=base_model_id,
                                     purpose="alignment",
                                     note=f"alignment_id={result.alignment_id}; cost not "
                                          "reported by API, check platform billing")
        return result

    async def get_alignment_status(self, alignment_id: str) -> AlignmentStatus:
        return AlignmentStatus.model_validate(
            await self._get(f"/api/v3/alignment-projects/{alignment_id}/status",
                            "alignment_status")
        )

    async def get_alignment(self, alignment_id: str) -> AlignmentDetail:
        return AlignmentDetail.model_validate(
            await self._get(f"/api/v3/alignment-projects/{alignment_id}", "alignment_detail")
        )

    # ------------------------------------------------------------------ models

    async def list_base_models(self, *, alignment_ready: bool | None = None,
                               limit: int = 100) -> list[BaseModelInfo]:
        params: dict[str, Any] = {"limit": limit}
        if alignment_ready is not None:
            params["alignment_ready"] = str(alignment_ready).lower()
        body = await self._get("/api/v3/models/base", "list_base_models", params=params)
        return [BaseModelInfo.model_validate(m) for m in body.get("models", [])]

    async def list_aligned_models(self, limit: int = 100) -> list[AlignedModel]:
        body = await self._get("/api/v3/models/aligned", "list_aligned_models",
                               params={"limit": limit})
        return [AlignedModel.model_validate(m) for m in body.get("domain_aligned_models", [])]

    async def deploy_model(self, model_id: str, early: bool = False) -> str:
        params = {"early": "true"} if early else None
        resp = await self._request("POST", f"/api/v3/models/{model_id}/deployment",
                                   idempotent=False, op="deploy_model", params=params)
        deployed: str = resp.json().get("model_id", model_id)
        return deployed

    async def get_deployment_status(self, model_id: str) -> DeploymentStatus:
        return DeploymentStatus.model_validate(
            await self._get(f"/api/v3/models/{model_id}/deployment/status", "deployment_status")
        )

    # ------------------------------------------------------------------ inference

    def _chat_body(self, model: str, messages: Sequence[ChatMessage], max_tokens: int,
                   temperature: float, stream: bool) -> dict[str, Any]:
        return {
            "model": model,
            "messages": [m.model_dump() for m in messages],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": stream,
        }

    async def chat(
        self,
        model: str,
        messages: Sequence[ChatMessage],
        *,
        max_tokens: int = 500,
        temperature: float = 0.1,
        purpose: str = "query",
    ) -> ChatResult:
        if self._spend:
            await self._spend.ensure_budget(CHAT_PATH)
        started = time.perf_counter()
        resp = await self._request(
            "POST", CHAT_PATH, idempotent=True, op="chat",
            json=self._chat_body(model, messages, max_tokens, temperature, stream=False),
        )
        latency_ms = (time.perf_counter() - started) * 1000
        body = resp.json()
        choice = body["choices"][0]
        result = ChatResult(
            content=choice["message"].get("content") or "",
            model=body.get("model", model),
            usage=Usage.model_validate(body.get("usage") or {}),
            confidence_score=body.get("confidence_score"),
            finish_reason=choice.get("finish_reason"),
            latency_ms=latency_ms,
        )
        if self._spend:
            await self._spend.record(endpoint=CHAT_PATH, model=model, purpose=purpose,
                                     latency_ms=latency_ms, **result.usage.model_dump())
        return result

    async def stream_chat(
        self,
        model: str,
        messages: Sequence[ChatMessage],
        *,
        max_tokens: int = 500,
        temperature: float = 0.1,
        purpose: str = "stream",
    ) -> AsyncIterator[StreamEvent]:
        if self._spend:
            await self._spend.ensure_budget(CHAT_PATH)
        body = self._chat_body(model, messages, max_tokens, temperature, stream=True)
        started = time.perf_counter()
        attempt = 0
        while True:
            try:
                async with self._http.stream("POST", CHAT_PATH, json=body) as resp:
                    if resp.status_code >= 400:
                        await resp.aread()
                        err = NugenAPIError(resp.status_code, _detail(resp), "stream_chat")
                        if not err.retryable or attempt >= self._max_retries:
                            raise err
                    else:
                        async for ev in self._parse_sse(resp, model, started, purpose, messages):
                            yield ev
                        return
            except _SAFE_TO_RETRY_ANY as exc:
                if attempt >= self._max_retries:
                    raise NugenError(f"stream_chat transport error: {type(exc).__name__}") from exc
            await self._sleep_for(attempt, None)
            attempt += 1

    async def _parse_sse(
        self, resp: httpx.Response, model: str, started: float, purpose: str,
        messages: Sequence[ChatMessage],
    ) -> AsyncIterator[StreamEvent]:
        usage: Usage | None = None
        finish: str | None = None
        text_parts: list[str] = []
        async for line in resp.aiter_lines():
            line = line.strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
            except ValueError:
                continue
            if chunk.get("object") == "confidence":
                score = chunk.get("confidence_score", chunk.get("confidence", chunk.get("score")))
                if isinstance(score, int | float):
                    yield StreamEvent(kind="confidence", confidence=float(score))
                continue
            if chunk.get("usage"):
                usage = Usage.model_validate(chunk["usage"])
            for choice in chunk.get("choices") or []:
                delta = (choice.get("delta") or {}).get("content") or ""
                if choice.get("finish_reason"):
                    finish = choice["finish_reason"]
                if delta:
                    text_parts.append(delta)
                    yield StreamEvent(kind="delta", delta=delta)
        latency_ms = (time.perf_counter() - started) * 1000
        note = None
        if usage is None:
            prompt = sum(estimate_tokens(m.content) for m in messages)
            completion = estimate_tokens("".join(text_parts))
            usage = Usage(prompt_tokens=prompt, completion_tokens=completion,
                          total_tokens=prompt + completion)
            note = "usage estimated (no usage chunk in stream)"
        if self._spend:
            await self._spend.record(endpoint=CHAT_PATH, model=model, purpose=purpose,
                                     latency_ms=latency_ms, note=note, **usage.model_dump())
        yield StreamEvent(kind="done", usage=usage, finish_reason=finish, latency_ms=latency_ms)
