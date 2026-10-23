import json
import os
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db import Base
from app.demo_seed import copy_database, import_report
from app.demo_snapshot import build_snapshot
from app.models import AlignmentRun, EvalRun, RunEvent, RunState, SpendEntry

TARGET_DB = "copilot_test_seed"


@pytest.fixture
async def target_engine() -> AsyncEngine:  # type: ignore[misc]
    src_url = os.environ["DATABASE_URL"]
    admin = create_async_engine(src_url, isolation_level="AUTOCOMMIT")
    async with admin.connect() as c:
        exists = await c.scalar(text("select 1 from pg_database where datname = :n"),
                                {"n": TARGET_DB})
        if not exists:
            await c.execute(text(f'create database "{TARGET_DB}"'))
    await admin.dispose()
    eng = create_async_engine(src_url.rsplit("/", 1)[0] + f"/{TARGET_DB}")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


async def _seed_source(sf: async_sessionmaker[AsyncSession]) -> None:
    async with sf() as s:
        parent = AlignmentRun(name="p", base_model_id="b", docs_hash="h1",
                              state=RunState.ALIGNED, model_id="m1",
                              created_at=datetime(2026, 10, 22, 13, 0, tzinfo=UTC))
        s.add(parent)
        await s.flush()
        child = AlignmentRun(name="c", kind="realign", parent_run_id=parent.id, base_model_id="b",
                             docs_hash="h2", state=RunState.ALIGNED, model_id="m2",
                             created_at=datetime(2026, 10, 22, 14, 0, tzinfo=UTC))
        s.add(child)
        await s.flush()
        s.add_all([RunEvent(run_id=parent.id, step="created", status="ok"),
                   RunEvent(run_id=child.id, step="created", status="ok"),
                   SpendEntry(endpoint="chat", total_tokens=10, est_cost_usd=0.1),
                   EvalRun(label="initial", summary={}, report={"questions": []})])
        await s.commit()


async def test_copy_database_copies_rows_in_fk_order_and_resets_sequences(
        session_factory, engine, target_engine) -> None:  # type: ignore[no-untyped-def]
    await _seed_source(session_factory)
    counts = await copy_database(engine, target_engine)
    assert counts["alignment_runs"] == 2 and counts["run_events"] == 2
    assert counts["spend_log"] == 1 and counts["eval_runs"] == 1
    dst = async_sessionmaker(target_engine, expire_on_commit=False)
    async with dst() as s:
        assert await s.scalar(select(func.count()).select_from(AlignmentRun)) == 2
        s.add(RunEvent(run_id=(await s.scalars(select(AlignmentRun.id))).first(),
                       step="new", status="ok"))
        await s.commit()  # would collide on the PK if the sequence wasn't reset
    # copying again replaces (no duplicates)
    again = await copy_database(engine, target_engine)
    async with dst() as s:
        assert await s.scalar(select(func.count()).select_from(RunEvent)) == again["run_events"]


async def test_import_report_is_idempotent(session_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    p = tmp_path / "r.json"
    p.write_text(json.dumps({"label": "Exp 3 + JSON repair (offline re-score, not a new run)",
                             "generated_at": "2026-10-22T14:24:44+00:00",
                             "summary": {"base": {"n": 40}}, "questions": []}))
    assert await import_report(session_factory, p) is True
    assert await import_report(session_factory, p) is False
    async with session_factory() as s:
        runs = (await s.scalars(select(EvalRun))).all()
    assert len(runs) == 1
    assert runs[0].created_at == datetime(2026, 10, 22, 14, 24, 44, tzinfo=UTC)


async def test_build_snapshot_has_every_read_endpoint(session_factory) -> None:  # type: ignore[no-untyped-def]
    await _seed_source(session_factory)
    snap = await build_snapshot(session_factory, base_model_id="meta-llama/Llama-3.2-3B-Instruct")
    r = snap["responses"]
    assert "/v1/models" not in r  # availability is live state, never snapshotted
    for path in ("/v1/pipeline/runs", "/v1/spend", "/v1/eval/latest",
                 "/v1/eval/history", "/v1/feedback/flagged", "/v1/feedback/stats",
                 "/v1/realign/dataset", "/v1/demo/status"):
        assert path in r, path
    hist = r["/v1/eval/history"]
    assert f"/v1/eval/runs/{hist[0]['id']}" in r
    assert r["/v1/demo/status"]["demo_mode"] is True
    assert snap["generated_at"]
    assert "NUGEN" not in json.dumps(snap)
