"""Support answering: cache -> model -> parse -> repair once -> safe fallback -> guardrails."""

import json
import logging
import time
from collections.abc import AsyncIterator, Sequence
from typing import Any, Literal, Protocol

from app.nugen.errors import NugenError
from app.nugen.schemas import ChatMessage, ChatResult, StreamEvent, Usage
from app.support.cache import ResponseCache
from app.support.guardrails import escalation_triggers
from app.support.parser import AnswerStreamExtractor, ParseError, parse_support_json
from app.support.prompt import build_messages, build_repair_messages
from app.support.schema import ModelAnswer, SupportResponse

log = logging.getLogger(__name__)

ModelKind = Literal["aligned", "base"]
FALLBACK_ANSWER = ("Thanks for reaching out. I want to make sure you get the right answer, so "
                   "I'm connecting you with a member of our support team who will follow up "
                   "shortly.")
ALIGNED_OFFLINE = "aligned_offline"
MAX_TOKENS = 300
TEMPERATURE = 0.1


class ChatClient(Protocol):
    async def chat(self, model: str, messages: Sequence[ChatMessage], *, max_tokens: int = ...,
                   temperature: float = ..., purpose: str = ...) -> ChatResult: ...

    def stream_chat(self, model: str, messages: Sequence[ChatMessage], *, max_tokens: int = ...,
                    temperature: float = ..., purpose: str = ...
                    ) -> AsyncIterator[StreamEvent]: ...


class InferenceRecorder(Protocol):
    async def record(self, query: str, response: SupportResponse) -> str: ...


class SupportService:
    def __init__(
        self,
        *,
        client: ChatClient,
        cache: ResponseCache | None,
        aligned_model_id: str | None,
        base_model_id: str,
        recorder: InferenceRecorder | None = None,
        purpose: str = "query",
    ) -> None:
        self.client = client
        self.cache = cache
        self.aligned_model_id = aligned_model_id
        self.base_model_id = base_model_id
        self.recorder = recorder
        self.purpose = purpose

    def model_for(self, kind: ModelKind) -> str:
        if kind == "aligned":
            if not self.aligned_model_id:
                raise NugenError("no aligned model is deployed yet")
            return self.aligned_model_id
        return self.base_model_id

    # ------------------------------------------------------------------ assembly

    def _build(self, *, parsed: ModelAnswer | None, result: ChatResult | None, model_id: str,
               kind: ModelKind, query: str, started: float, request_id: str | None,
               repaired: bool, first_ok: bool, raw: str, tokens: int,
               error: str | None = None) -> SupportResponse:
        triggers = escalation_triggers(query)
        if parsed is None:
            resp = SupportResponse(
                intent="other", answer=FALLBACK_ANSWER, policy_ref="UT-ESC-012",
                escalate_to_human=True, confidence=0.0, confidence_source="none",
                model_id=model_id, model_kind=kind,
                latency_ms=0, request_id=request_id, repaired=repaired, fallback=True,
                json_valid_first_try=first_ok, error=error, raw_output=raw, total_tokens=tokens,
            )
        else:
            confidence = parsed.confidence
            source: Literal["nugen", "model_reported"] = "model_reported"
            if result is not None and result.confidence_score is not None:
                confidence = min(max(result.confidence_score / 100, 0.0), 1.0)
                source = "nugen"
            resp = SupportResponse(
                intent=parsed.intent, answer=parsed.answer, policy_ref=parsed.policy_ref,
                escalate_to_human=parsed.escalate_to_human or bool(triggers),
                confidence=round(confidence, 4), confidence_source=source,
                model_id=model_id, model_kind=kind,
                latency_ms=0, request_id=request_id, repaired=repaired,
                json_valid_first_try=first_ok, raw_output=raw, total_tokens=tokens,
                model_escalate=parsed.escalate_to_human,
            )
        resp.guardrail_triggers = triggers
        resp.latency_ms = round((time.perf_counter() - started) * 1000, 1)
        return resp

    def _effective_kind(self, kind: ModelKind) -> tuple[ModelKind, str | None]:
        """No deployed aligned model (e.g. undeployed to save credits): serve base, say so."""
        if kind == "aligned" and not self.aligned_model_id:
            return "base", ALIGNED_OFFLINE
        return kind, None

    async def _finish(self, query: str, resp: SupportResponse, use_cache: bool,
                      notice: str | None = None) -> SupportResponse:
        resp.notice = notice
        if self.cache and use_cache and not resp.fallback:
            await self.cache.set(resp.model_id, query, resp)
        if self.recorder:
            try:
                resp.inference_id = await self.recorder.record(query, resp)
            except Exception:  # logging must never break answering
                log.exception("inference.record_failed")
        return resp

    async def _cached(self, model_id: str, query: str, started: float,
                      request_id: str | None, use_cache: bool) -> SupportResponse | None:
        if not (self.cache and use_cache):
            return None
        hit = await self.cache.get(model_id, query)
        if hit is None:
            return None
        hit.cached = True
        hit.request_id = request_id
        hit.latency_ms = round((time.perf_counter() - started) * 1000, 1)
        return hit

    # ------------------------------------------------------------------ non-streaming

    async def answer(self, query: str, model_kind: ModelKind = "aligned",
                     request_id: str | None = None, use_cache: bool = True) -> SupportResponse:
        started = time.perf_counter()
        model_kind, notice = self._effective_kind(model_kind)
        try:
            model_id = self.model_for(model_kind)
        except NugenError as exc:
            return self._build(parsed=None, result=None, model_id="unavailable", kind=model_kind,
                               query=query, started=started, request_id=request_id,
                               repaired=False, first_ok=False, raw="", tokens=0, error=str(exc))
        if hit := await self._cached(model_id, query, started, request_id, use_cache):
            return await self._finish(query, hit, use_cache=False, notice=notice)

        raw, tokens, result = "", 0, None
        try:
            result = await self.client.chat(model_id, build_messages(query),
                                            max_tokens=MAX_TOKENS, temperature=TEMPERATURE,
                                            purpose=self.purpose)
            raw, tokens = result.content, result.usage.total_tokens
            try:
                parsed = parse_support_json(raw)
                resp = self._build(parsed=parsed, result=result, model_id=model_id,
                                   kind=model_kind, query=query, started=started,
                                   request_id=request_id, repaired=False, first_ok=True,
                                   raw=raw, tokens=tokens)
            except ParseError as err:
                resp = await self._repair(query, raw, str(err), model_id, model_kind, started,
                                          request_id, tokens)
        except NugenError as exc:
            log.warning("support.upstream_error", extra={"error": str(exc)[:300]})
            resp = self._build(parsed=None, result=result, model_id=model_id, kind=model_kind,
                               query=query, started=started, request_id=request_id,
                               repaired=False, first_ok=False, raw=raw, tokens=tokens,
                               error=f"upstream_error: {str(exc)[:200]}")
        return await self._finish(query, resp, use_cache, notice)

    async def _repair(self, query: str, raw: str, error: str, model_id: str, kind: ModelKind,
                      started: float, request_id: str | None, tokens: int) -> SupportResponse:
        log.info("support.repair", extra={"error": error, "model_id": model_id})
        result = await self.client.chat(model_id, build_repair_messages(query, raw, error),
                                        max_tokens=MAX_TOKENS, temperature=0.0,
                                        purpose=f"{self.purpose}_repair")
        tokens += result.usage.total_tokens
        combined_raw = f"{raw}\n---repair---\n{result.content}"
        try:
            parsed = parse_support_json(result.content)
        except ParseError as err2:
            return self._build(parsed=None, result=result, model_id=model_id, kind=kind,
                               query=query, started=started, request_id=request_id,
                               repaired=True, first_ok=False, raw=combined_raw, tokens=tokens,
                               error=f"invalid_model_output: {err2}")
        return self._build(parsed=parsed, result=result, model_id=model_id, kind=kind,
                           query=query, started=started, request_id=request_id, repaired=True,
                           first_ok=False, raw=combined_raw, tokens=tokens)

    # ------------------------------------------------------------------ streaming

    async def stream(self, query: str, model_kind: ModelKind = "aligned",
                     request_id: str | None = None, use_cache: bool = True
                     ) -> AsyncIterator[dict[str, str]]:
        """SSE events: meta -> (token | answer_delta | confidence)* -> final."""
        started = time.perf_counter()

        def ev(event: str, data: Any) -> dict[str, str]:
            return {"event": event, "data": json.dumps(data)}

        model_kind, notice = self._effective_kind(model_kind)
        try:
            model_id = self.model_for(model_kind)
        except NugenError as exc:
            resp = self._build(parsed=None, result=None, model_id="unavailable", kind=model_kind,
                               query=query, started=started, request_id=request_id,
                               repaired=False, first_ok=False, raw="", tokens=0, error=str(exc))
            yield ev("meta", {"request_id": request_id, "model_id": None,
                              "model_kind": model_kind})
            yield ev("answer_delta", {"text": resp.answer})
            yield ev("final", resp.model_dump())
            return

        yield ev("meta", {"request_id": request_id, "model_id": model_id,
                          "model_kind": model_kind, "notice": notice})
        if hit := await self._cached(model_id, query, started, request_id, use_cache):
            yield ev("answer_delta", {"text": hit.answer})
            yield ev("final", (await self._finish(query, hit, use_cache=False,
                                                  notice=notice)).model_dump())
            return

        extractor = AnswerStreamExtractor()
        parts: list[str] = []
        tokens = 0
        last_conf: float | None = None
        try:
            async for e in self.client.stream_chat(model_id, build_messages(query),
                                                   max_tokens=MAX_TOKENS,
                                                   temperature=TEMPERATURE,
                                                   purpose=f"{self.purpose}_stream"):
                if e.kind == "delta":
                    parts.append(e.delta)
                    yield ev("token", {"text": e.delta})
                    if text := extractor.feed(e.delta):
                        yield ev("answer_delta", {"text": text})
                elif e.kind == "confidence":
                    last_conf = e.confidence
                    yield ev("confidence", {"value": e.confidence})
                elif e.kind == "done" and e.usage:
                    tokens = e.usage.total_tokens
            raw = "".join(parts)
            try:
                parsed = parse_support_json(raw)
                pseudo = ChatResult(content=raw, model=model_id, usage=Usage(total_tokens=tokens),
                                    confidence_score=last_conf, latency_ms=0)
                resp = self._build(parsed=parsed, result=pseudo, model_id=model_id,
                                   kind=model_kind, query=query, started=started,
                                   request_id=request_id, repaired=False, first_ok=True,
                                   raw=raw, tokens=tokens)
            except ParseError as err:
                resp = await self._repair(query, raw, str(err), model_id, model_kind, started,
                                          request_id, tokens)
                yield ev("repaired", {"answer": resp.answer})
        except NugenError as exc:
            resp = self._build(parsed=None, result=None, model_id=model_id, kind=model_kind,
                               query=query, started=started, request_id=request_id,
                               repaired=False, first_ok=False, raw="".join(parts), tokens=tokens,
                               error=f"upstream_error: {str(exc)[:200]}")
        yield ev("final", (await self._finish(query, resp, use_cache, notice)).model_dump())
