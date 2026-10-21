"""Resumable alignment pipeline: upload docs -> benchmark -> align -> poll -> deploy.

Every Nugen id is committed to Postgres the moment it exists, so a crash or a transient API
error at any step resumes from the last completed step instead of redoing (and re-paying for)
earlier ones. A run is keyed by a hash of its inputs: same docs + benchmark + base model ->
same run; any change -> a new run.
"""

import asyncio
import hashlib
import logging
import time
import uuid
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path
from typing import Any, Protocol, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import AlignmentRun, RunEvent, RunState
from app.nugen.errors import NugenAPIError, NugenTimeoutError
from app.nugen.schemas import (
    AlignedModel,
    AlignmentDetail,
    AlignmentStatus,
    BenchmarkStatus,
    BenchmarkUpload,
    DeploymentStatus,
    DocumentStatus,
)

log = logging.getLogger(__name__)

MIN_WORDS = 500  # Nugen rejects any uploaded document shorter than this
EXCLUDED_DOCS = {"INDEX.md", "README.md"}
ALIGN_SUCCESS = {"READY", "EVALUATING", "EVALUATED"}
ALIGN_FAILURE = {"FAILED", "STOPPED"}
DONE_STATES = {RunState.ALIGNED, RunState.DEPLOYING, RunState.DEPLOYED}

T = TypeVar("T")
_RESERVED_LOG_KEYS = set(vars(logging.LogRecord("", 0, "", 0, "", None, None))) | {"message"}


class DocValidationError(ValueError):
    pass


class PipelineClient(Protocol):
    async def upload_documents(self, paths: Sequence[Path], categories: list[str] | None = ...,
                               names: list[str] | None = ...) -> list[str]: ...
    async def get_document_status(self, document_id: str) -> DocumentStatus: ...
    async def upload_benchmark(self, path: Path, document_id: str, name: str,
                               description: str | None = ...) -> BenchmarkUpload: ...
    async def get_benchmark_status(self, benchmark_id: str) -> BenchmarkStatus: ...
    async def create_alignment(self, *, alignment_name: str, base_model_id: str,
                               document_ids: list[str], benchmark_id: str | None,
                               description: str | None = ...) -> AlignmentStatus: ...
    async def get_alignment_status(self, alignment_id: str) -> AlignmentStatus: ...
    async def get_alignment(self, alignment_id: str) -> AlignmentDetail: ...
    async def list_aligned_models(self, limit: int = ...) -> list[AlignedModel]: ...
    async def deploy_model(self, model_id: str, early: bool = ...) -> str: ...
    async def get_deployment_status(self, model_id: str) -> DeploymentStatus: ...


def collect_documents(docs_dir: Path, extra: Sequence[Path] = ()) -> list[Path]:
    files = sorted(p for p in docs_dir.glob("*.md") if p.name not in EXCLUDED_DOCS)
    files += sorted(set(extra) - set(files))
    if not files:
        raise DocValidationError(f"no .md documents found in {docs_dir}")
    short = [f"{p.name} ({n} words)" for p in files
             if (n := len(p.read_text(encoding="utf-8").split())) < MIN_WORDS]
    if short:
        raise DocValidationError(f"documents under {MIN_WORDS} words: {', '.join(short)}")
    return files


def inputs_hash(files: Sequence[Path], benchmark: Path, base_model_id: str) -> str:
    h = hashlib.sha256(base_model_id.encode())
    for p in [*files, benchmark]:
        h.update(p.name.encode())
        h.update(p.read_bytes())
    return h.hexdigest()


class AlignmentPipeline:
    def __init__(
        self,
        *,
        session_factory: async_sessionmaker[AsyncSession],
        client: PipelineClient,
        docs_dir: Path,
        benchmark_path: Path,
        base_model_id: str,
        poll_interval: float = 15.0,
        poll_timeout: float = 3 * 3600,
        name_prefix: str = "urbane-threads-support",
        on_event: Callable[[str, str, dict[str, Any]], None] | None = None,
    ) -> None:
        self._sf = session_factory
        self._client = client
        self._docs_dir = docs_dir
        self._benchmark = benchmark_path
        self._base_model = base_model_id
        self._poll_interval = poll_interval
        self._poll_timeout = poll_timeout
        self._prefix = name_prefix
        self.on_event = on_event

    # ------------------------------------------------------------------ helpers

    async def _event(self, s: AsyncSession, run: AlignmentRun, step: str, status: str,
                     **detail: Any) -> None:
        s.add(RunEvent(run_id=run.id, step=step, status=status, detail=detail or None))
        await s.commit()
        log.info("pipeline.step", extra={"run_id": str(run.id), "step": step, "status": status,
                                          **{k: v for k, v in detail.items()
                                             if isinstance(v, str | int | float)
                                             and k not in _RESERVED_LOG_KEYS}})
        if self.on_event:
            self.on_event(step, status, detail)

    async def _poll(self, fetch: Callable[[], Awaitable[T]], done: Callable[[T], bool],
                    what: str, on_change: Callable[[T], Awaitable[None]] | None = None) -> T:
        deadline = time.monotonic() + self._poll_timeout
        while True:
            value = await fetch()
            if on_change:
                await on_change(value)
            if done(value):
                return value
            if time.monotonic() > deadline:
                raise NugenTimeoutError(f"timed out waiting for {what}")
            await asyncio.sleep(self._poll_interval)

    async def _find_or_create(self, s: AsyncSession, files: list[Path], kind: str,
                              parent_run_id: uuid.UUID | None) -> AlignmentRun:
        digest = inputs_hash(files, self._benchmark, self._base_model)
        run = await s.scalar(
            select(AlignmentRun)
            .where(AlignmentRun.docs_hash == digest, AlignmentRun.state != RunState.FAILED)
            .order_by(AlignmentRun.created_at.desc())
            .limit(1)
        )
        if run:
            return run
        run = AlignmentRun(
            name=f"{self._prefix}-{digest[:8]}", kind=kind, parent_run_id=parent_run_id,
            base_model_id=self._base_model, docs_hash=digest, state=RunState.CREATED,
            document_names=[f.name for f in files],
        )
        s.add(run)
        await s.commit()
        await self._event(s, run, "created", "ok", docs=len(files))
        return run

    # ------------------------------------------------------------------ align

    async def align(
        self,
        *,
        confirm: bool,
        kind: str = "initial",
        extra_docs: Sequence[Path] = (),
        parent_run_id: uuid.UUID | None = None,
    ) -> AlignmentRun:
        files = collect_documents(self._docs_dir, extra_docs)
        async with self._sf() as s:
            run = await self._find_or_create(s, files, kind, parent_run_id)
            if run.state in DONE_STATES:
                return run
            try:
                await self._advance(s, run, files, confirm)
            except Exception as exc:
                run.last_error = str(exc)[:2000]
                await s.commit()
                await self._event(s, run, "error", "error", error=str(exc)[:500])
                raise
            return run

    async def _advance(self, s: AsyncSession, run: AlignmentRun, files: list[Path],
                       confirm: bool) -> None:
        c = self._client
        if run.state == RunState.CREATED:
            t0 = time.perf_counter()
            run.document_ids = await c.upload_documents(
                files, categories=["urbane-threads-policy"], names=[f.stem for f in files])
            run.state = RunState.DOCS_UPLOADED
            await self._event(s, run, "upload_docs", "ok", count=len(run.document_ids),
                              seconds=round(time.perf_counter() - t0, 2))

        if run.state == RunState.DOCS_UPLOADED:
            t0 = time.perf_counter()
            for doc_id in run.document_ids or []:
                st = await self._poll(lambda d=doc_id: c.get_document_status(d),  # type: ignore[misc]
                                      lambda v: v.status in {"READY", "FAILED"},
                                      f"document {doc_id}")
                if st.status == "FAILED":
                    return await self._fail(s, run, f"document {doc_id} failed processing")
            run.state = RunState.DOCS_READY
            await self._event(s, run, "docs_ready", "ok",
                              seconds=round(time.perf_counter() - t0, 2))

        if run.state == RunState.DOCS_READY:
            t0 = time.perf_counter()
            if not run.benchmark_id:
                assert run.document_ids
                up = await c.upload_benchmark(
                    self._benchmark, run.document_ids[0], name=f"{run.name}-benchmark",
                    description="Curated Urbane Threads support Q&A (policy-checked)")
                run.benchmark_id = up.benchmark_id
                await s.commit()
            bench_id = run.benchmark_id
            await self._poll(lambda: c.get_benchmark_status(bench_id),
                             lambda v: v.status in {"READY", "FAILED"}, "benchmark")
            run.state = RunState.BENCHMARK_READY
            await self._event(s, run, "benchmark", "ok", benchmark_id=run.benchmark_id,
                              seconds=round(time.perf_counter() - t0, 2))

        if run.state == RunState.BENCHMARK_READY:
            if not confirm:
                await self._event(s, run, "alignment_started", "awaiting_confirmation")
                return None
            assert run.document_ids
            created = await c.create_alignment(
                alignment_name=run.name, base_model_id=run.base_model_id,
                document_ids=run.document_ids, benchmark_id=run.benchmark_id,
                description="Urbane Threads support policies (returns, refunds, shipping, GST, "
                            "warranty, marketplace, escalation)")
            run.alignment_id = created.alignment_id
            run.alignment_status = created.status
            run.state = RunState.ALIGNMENT_STARTED
            await self._event(s, run, "alignment_started", "ok", alignment_id=run.alignment_id,
                              nugen_message=created.message or "")

        if run.state == RunState.ALIGNMENT_STARTED:
            assert run.alignment_id
            align_id = run.alignment_id
            t0 = time.perf_counter()

            async def track(v: AlignmentStatus) -> None:
                if v.status != run.alignment_status:
                    run.alignment_status = v.status
                    await self._event(s, run, "alignment_poll", v.status,
                                      queue_position=v.queue_position or 0)

            final = await self._poll(lambda: c.get_alignment_status(align_id),
                                     lambda v: v.status in ALIGN_SUCCESS | ALIGN_FAILURE,
                                     "alignment", track)
            if final.status in ALIGN_FAILURE:
                detail = await c.get_alignment(align_id)
                return await self._fail(s, run, detail.error or f"alignment {final.status}")
            run.evaluation_id = final.evaluation_id
            run.model_id = await self._resolve_model_id(align_id)
            run.last_error = None
            run.state = RunState.ALIGNED
            await self._event(s, run, "aligned", "ok", model_id=run.model_id,
                              evaluation_id=run.evaluation_id or "",
                              seconds=round(time.perf_counter() - t0, 2))
        return None

    async def _resolve_model_id(self, alignment_id: str) -> str:
        detail = await self._client.get_alignment(alignment_id)
        if detail.model_id:
            return detail.model_id
        for m in await self._client.list_aligned_models(limit=100):
            if m.alignment_id == alignment_id:
                return m.model_id
        raise NugenAPIError(404, f"no aligned model found for {alignment_id}", "resolve_model")

    async def _fail(self, s: AsyncSession, run: AlignmentRun, reason: str) -> None:
        run.state = RunState.FAILED
        run.last_error = reason
        await s.commit()
        await self._event(s, run, "failed", "error", error=reason)

    # ------------------------------------------------------------------ deploy

    async def latest_run(self, s: AsyncSession, run_id: uuid.UUID | None = None
                         ) -> AlignmentRun | None:
        q = select(AlignmentRun)
        q = q.where(AlignmentRun.id == run_id) if run_id else q.where(
            AlignmentRun.state.in_(DONE_STATES))
        return await s.scalar(q.order_by(AlignmentRun.created_at.desc()).limit(1))

    async def deploy(self, run_id: uuid.UUID | None = None) -> AlignmentRun:
        c = self._client
        async with self._sf() as s:
            run = await self.latest_run(s, run_id)
            if run is None or not run.model_id:
                raise ValueError("no aligned run with a model_id to deploy; run `align` first")
            if run.state == RunState.DEPLOYED:
                return run
            model_id = run.model_id
            t0 = time.perf_counter()
            try:
                current = await c.get_deployment_status(model_id)
                if current.status == "UNDEPLOYED":
                    await c.deploy_model(model_id)
                run.state = RunState.DEPLOYING
                await self._event(s, run, "deploy", "DEPLOYING", model_id=model_id)

                async def track(v: DeploymentStatus) -> None:
                    run.deployment_status = v.status
                    await s.commit()

                # Right after the POST the status can still read UNDEPLOYED (no error) for a
                # moment; only an UNDEPLOYED *with* an error is a failed deploy.
                final = await self._poll(lambda: c.get_deployment_status(model_id),
                                         lambda v: v.status == "DEPLOYED" or v.failed,
                                         "deployment", track)
            except Exception as exc:
                run.last_error = str(exc)[:2000]
                await s.commit()
                raise
            if final.failed:
                await self._fail(s, run, final.error or "deploy failed")
                return run
            run.state = RunState.DEPLOYED
            run.last_error = None
            await self._event(s, run, "deployed", "ok", model_id=model_id,
                              seconds=round(time.perf_counter() - t0, 2))
            return run
