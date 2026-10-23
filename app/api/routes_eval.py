import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.deps import ReadAuthed, Services
from app.models import EvalRun

router = APIRouter(prefix="/v1/eval", tags=["eval"])


@router.get("/latest")
async def latest(_: ReadAuthed, svc: Services) -> dict[str, Any]:
    """Latest *real* run; offline re-scores (`rescored_from`) stay available via history."""
    async with svc.session_factory() as s:
        runs = (await s.scalars(select(EvalRun).order_by(EvalRun.created_at.desc())
                                .limit(20))).all()
    run = next((r for r in runs if "rescored_from" not in r.report), runs[0] if runs else None)
    if run is None:
        raise HTTPException(404, "no eval has run yet; run `python -m app.eval run`")
    return {**run.report, "id": str(run.id)}


@router.get("/history")
async def history(_: ReadAuthed, svc: Services, limit: int = 20) -> list[dict[str, Any]]:
    async with svc.session_factory() as s:
        runs = (await s.scalars(select(EvalRun).order_by(EvalRun.created_at.asc())
                                .limit(min(limit, 100)))).all()
    return [{"id": str(r.id), "label": r.label, "generated_at": r.created_at.isoformat(),
             "summary": r.summary} for r in runs]


@router.get("/runs/{run_id}")
async def run_detail(run_id: uuid.UUID, _: ReadAuthed, svc: Services) -> dict[str, Any]:
    async with svc.session_factory() as s:
        run = await s.get(EvalRun, run_id)
    if run is None:
        raise HTTPException(404, "eval run not found")
    return {**run.report, "id": str(run.id), "label": run.label}
