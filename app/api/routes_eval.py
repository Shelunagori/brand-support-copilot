from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.deps import Authed, Services
from app.models import EvalRun

router = APIRouter(prefix="/v1/eval", tags=["eval"])


@router.get("/latest")
async def latest(_: Authed, svc: Services) -> dict[str, Any]:
    async with svc.session_factory() as s:
        run = await s.scalar(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(1))
    if run is None:
        raise HTTPException(404, "no eval has run yet; run `python -m app.eval run`")
    return {**run.report, "id": str(run.id)}


@router.get("/history")
async def history(_: Authed, svc: Services, limit: int = 20) -> list[dict[str, Any]]:
    async with svc.session_factory() as s:
        runs = (await s.scalars(select(EvalRun).order_by(EvalRun.created_at.asc())
                                .limit(min(limit, 100)))).all()
    return [{"id": str(r.id), "label": r.label, "generated_at": r.created_at.isoformat(),
             "summary": r.summary} for r in runs]
