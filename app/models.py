import enum
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class RunState(enum.StrEnum):
    CREATED = "CREATED"
    DOCS_UPLOADED = "DOCS_UPLOADED"
    DOCS_READY = "DOCS_READY"
    BENCHMARK_READY = "BENCHMARK_READY"
    ALIGNMENT_STARTED = "ALIGNMENT_STARTED"
    ALIGNED = "ALIGNED"
    DEPLOYING = "DEPLOYING"
    DEPLOYED = "DEPLOYED"
    FAILED = "FAILED"


class AlignmentRun(Base):
    """One end-to-end alignment attempt; every Nugen id is persisted as soon as it exists."""

    __tablename__ = "alignment_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20), default="initial")  # initial | realign
    parent_run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("alignment_runs.id"))
    base_model_id: Mapped[str] = mapped_column(String(200))
    docs_hash: Mapped[str] = mapped_column(String(64), index=True)
    state: Mapped[RunState] = mapped_column(Enum(RunState, name="run_state"),
                                            default=RunState.CREATED)
    document_ids: Mapped[list[str] | None] = mapped_column(JSON)
    document_names: Mapped[list[str] | None] = mapped_column(JSON)
    benchmark_id: Mapped[str | None] = mapped_column(String(100))
    alignment_id: Mapped[str | None] = mapped_column(String(100))
    alignment_status: Mapped[str | None] = mapped_column(String(30))
    evaluation_id: Mapped[str | None] = mapped_column(String(100))
    model_id: Mapped[str | None] = mapped_column(String(200))
    deployment_status: Mapped[str | None] = mapped_column(String(30))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 onupdate=utcnow)


class RunEvent(Base):
    """Append-only timeline of pipeline steps (drives the CLI status view and the UI timeline)."""

    __tablename__ = "run_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("alignment_runs.id", ondelete="CASCADE"),
                                              index=True)
    step: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(30))
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SpendEntry(Base):
    """Every paid Nugen call: endpoint, tokens and estimated cost."""

    __tablename__ = "spend_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    endpoint: Mapped[str] = mapped_column(String(200))
    model: Mapped[str | None] = mapped_column(String(200))
    purpose: Mapped[str | None] = mapped_column(String(50))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    est_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    latency_ms: Mapped[float | None] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class EvalRun(Base):
    """One eval pass (base vs aligned); `report` holds per-question results for the UI."""

    __tablename__ = "eval_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    label: Mapped[str] = mapped_column(String(200))
    alignment_run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("alignment_runs.id"))
    summary: Mapped[dict[str, Any]] = mapped_column(JSON)
    report: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 index=True)
