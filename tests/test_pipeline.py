import json
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import AlignmentRun, RunEvent, RunState
from app.nugen.errors import NugenAPIError
from app.nugen.schemas import (
    AlignmentDetail,
    AlignmentStatus,
    BenchmarkStatus,
    BenchmarkUpload,
    DeploymentStatus,
    DocumentStatus,
)
from app.pipeline import AlignmentPipeline, DocValidationError, collect_documents

WORDS = " ".join(["policy"] * 520)


class FakeNugen:
    """In-memory stand-in for NugenClient with scripted status sequences."""

    def __init__(self) -> None:
        self.calls: dict[str, int] = {}
        self.alignment_statuses = ["QUEUED", "PROCESSING", "READY"]
        self.deploy_statuses = ["UNDEPLOYED", "DEPLOYING", "DEPLOYED"]
        self.deploy_error: str | None = None
        self.fail_alignment_status_once = False

    def _hit(self, name: str) -> None:
        self.calls[name] = self.calls.get(name, 0) + 1

    async def upload_documents(self, paths: list[Path], categories: list[str] | None = None,
                               names: list[str] | None = None) -> list[str]:
        self._hit("upload_documents")
        return [f"document_{i}" for i, _ in enumerate(paths)]

    async def get_document_status(self, document_id: str) -> DocumentStatus:
        self._hit("get_document_status")
        return DocumentStatus(status="READY", document_id=document_id)

    async def upload_benchmark(self, path: Path, document_id: str, name: str,
                               description: str | None = None) -> BenchmarkUpload:
        self._hit("upload_benchmark")
        return BenchmarkUpload(benchmark_id="benchmark_1", status="READY", n_samples=2)

    async def get_benchmark_status(self, benchmark_id: str) -> BenchmarkStatus:
        self._hit("get_benchmark_status")
        return BenchmarkStatus(benchmark_id=benchmark_id, status="READY")

    async def create_alignment(self, **kw: Any) -> AlignmentStatus:
        self._hit("create_alignment")
        return AlignmentStatus(alignment_id="alignment_1", status="PROCESSING")

    async def get_alignment_status(self, alignment_id: str) -> AlignmentStatus:
        self._hit("get_alignment_status")
        if self.fail_alignment_status_once:
            self.fail_alignment_status_once = False
            raise NugenAPIError(503, "upstream unavailable", "GET status")
        st = self.alignment_statuses.pop(0) if len(self.alignment_statuses) > 1 else \
            self.alignment_statuses[0]
        return AlignmentStatus(alignment_id=alignment_id, status=st)

    async def get_alignment(self, alignment_id: str) -> AlignmentDetail:
        self._hit("get_alignment")
        return AlignmentDetail(alignment_id=alignment_id, status="READY", model_id="model_1")

    async def deploy_model(self, model_id: str, early: bool = False) -> str:
        self._hit("deploy_model")
        return model_id

    async def get_deployment_status(self, model_id: str) -> DeploymentStatus:
        self._hit("get_deployment_status")
        if self.deploy_error:
            return DeploymentStatus(model_id=model_id, status="UNDEPLOYED",
                                    error=self.deploy_error)
        st = self.deploy_statuses.pop(0) if len(self.deploy_statuses) > 1 else \
            self.deploy_statuses[0]
        return DeploymentStatus(model_id=model_id, status=st)


@pytest.fixture
def docs_dir(tmp_path: Path) -> Path:
    d = tmp_path / "docs"
    d.mkdir()
    (d / "returns.md").write_text(WORDS)
    (d / "shipping.md").write_text(WORDS)
    (d / "INDEX.md").write_text("short index")
    return d


@pytest.fixture
def benchmark(tmp_path: Path) -> Path:
    p = tmp_path / "benchmark.json"
    p.write_text(json.dumps([{"sample_num": 1, "instruction": "q", "response": "a"}]))
    return p


def make_pipeline(sf: async_sessionmaker[AsyncSession], fake: FakeNugen, docs: Path,
                  bench: Path) -> AlignmentPipeline:
    return AlignmentPipeline(
        session_factory=sf, client=fake, docs_dir=docs, benchmark_path=bench,  # type: ignore[arg-type]
        base_model_id="Qwen/Qwen2.5-0.5B-Instruct", poll_interval=0, poll_timeout=5,
    )


def test_collect_documents_skips_index_and_rejects_short_docs(docs_dir: Path) -> None:
    files = collect_documents(docs_dir)
    assert [f.name for f in files] == ["returns.md", "shipping.md"]
    (docs_dir / "tiny.md").write_text("too short")
    with pytest.raises(DocValidationError, match="tiny.md"):
        collect_documents(docs_dir)


async def test_align_happy_path_persists_every_step(session_factory, docs_dir, benchmark):  # type: ignore[no-untyped-def]
    fake = FakeNugen()
    run = await make_pipeline(session_factory, fake, docs_dir, benchmark).align(confirm=True)
    assert run.state == RunState.ALIGNED
    assert run.document_ids == ["document_0", "document_1"]
    assert run.benchmark_id == "benchmark_1"
    assert run.alignment_id == "alignment_1"
    assert run.model_id == "model_1"
    async with session_factory() as s:
        steps = (await s.scalars(select(RunEvent.step).where(RunEvent.run_id == run.id))).all()
    assert {"upload_docs", "docs_ready", "benchmark", "alignment_started", "aligned"} <= set(steps)


async def test_align_without_confirm_stops_before_paid_alignment(session_factory, docs_dir,  # type: ignore[no-untyped-def]
                                                                benchmark):
    fake = FakeNugen()
    run = await make_pipeline(session_factory, fake, docs_dir, benchmark).align(confirm=False)
    assert run.state == RunState.BENCHMARK_READY
    assert "create_alignment" not in fake.calls


async def test_align_resumes_after_failure_without_redoing_steps(session_factory, docs_dir,  # type: ignore[no-untyped-def]
                                                                 benchmark):
    fake = FakeNugen()
    fake.fail_alignment_status_once = True
    pipe = make_pipeline(session_factory, fake, docs_dir, benchmark)
    with pytest.raises(NugenAPIError):
        await pipe.align(confirm=True)
    async with session_factory() as s:
        run = (await s.scalars(select(AlignmentRun))).one()
        assert run.state == RunState.ALIGNMENT_STARTED
        assert run.last_error and "upstream unavailable" in run.last_error

    run = await pipe.align(confirm=True)
    assert run.state == RunState.ALIGNED
    assert fake.calls["upload_documents"] == 1
    assert fake.calls["create_alignment"] == 1


async def test_align_is_idempotent_once_complete(session_factory, docs_dir, benchmark):  # type: ignore[no-untyped-def]
    fake = FakeNugen()
    pipe = make_pipeline(session_factory, fake, docs_dir, benchmark)
    first = await pipe.align(confirm=True)
    calls_before = dict(fake.calls)
    second = await pipe.align(confirm=True)
    assert second.id == first.id
    assert fake.calls == calls_before


async def test_changed_docs_start_a_new_run(session_factory, docs_dir, benchmark):  # type: ignore[no-untyped-def]
    fake = FakeNugen()
    pipe = make_pipeline(session_factory, fake, docs_dir, benchmark)
    first = await pipe.align(confirm=True)
    (docs_dir / "returns.md").write_text(WORDS + " updated")
    fake.alignment_statuses = ["READY"]
    second = await pipe.align(confirm=True)
    assert second.id != first.id
    assert fake.calls["upload_documents"] == 2


async def test_deploy_polls_until_deployed(session_factory, docs_dir, benchmark):  # type: ignore[no-untyped-def]
    fake = FakeNugen()
    pipe = make_pipeline(session_factory, fake, docs_dir, benchmark)
    await pipe.align(confirm=True)
    run = await pipe.deploy()
    assert run.state == RunState.DEPLOYED
    assert fake.calls["deploy_model"] == 1
    # second deploy is a no-op
    await pipe.deploy()
    assert fake.calls["deploy_model"] == 1


async def test_deploy_failure_is_recorded(session_factory, docs_dir, benchmark):  # type: ignore[no-untyped-def]
    fake = FakeNugen()
    fake.deploy_error = "provider rejected the adapter"
    pipe = make_pipeline(session_factory, fake, docs_dir, benchmark)
    await pipe.align(confirm=True)
    run = await pipe.deploy()
    assert run.state == RunState.FAILED
    assert run.last_error == "provider rejected the adapter"


async def test_alignment_failure_marks_run_failed(session_factory, docs_dir, benchmark):  # type: ignore[no-untyped-def]
    fake = FakeNugen()
    fake.alignment_statuses = ["FAILED"]
    run = await make_pipeline(session_factory, fake, docs_dir, benchmark).align(confirm=True)
    assert run.state == RunState.FAILED



def test_collect_documents_active_only_filters_by_status_header(docs_dir: Path) -> None:
    (docs_dir / "returns.md").write_text("Policy-ID: UT-RET-001\nStatus: ACTIVE\n" + WORDS)
    (docs_dir / "legacy.md").write_text("Status: SUPERSEDED (replaced)\n" + WORDS)
    (docs_dir / "blog.md").write_text("Status: NOT A POLICY\n" + WORDS)
    names = [f.name for f in collect_documents(docs_dir, active_only=True)]
    assert names == ["returns.md"]  # shipping.md has no Status header -> excluded too
    assert len(collect_documents(docs_dir)) == 4


def test_real_doc_pack_active_only_excludes_distractors() -> None:
    names = {f.name for f in collect_documents(Path("data/docs"), active_only=True)}
    assert len(names) == 15
    assert not names & {"legacy_returns_policy_2024.md", "faq_2024_archive.md",
                        "blog_style_guide_marketing.md"}
