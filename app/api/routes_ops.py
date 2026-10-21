from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import Authed, Services
from app.models import AlignmentRun, RunEvent
from app.spend import SpendTracker

router = APIRouter(tags=["ops"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready(svc: Services) -> JSONResponse:
    from app.api.main import ping

    checks = await ping(svc)
    ok = all(v == "ok" for v in checks.values())
    return JSONResponse({"status": "ready" if ok else "not_ready", "checks": checks},
                        status_code=200 if ok else 503)


@router.get("/v1/models")
async def models(_: Authed, svc: Services) -> dict[str, Any]:
    return {"aligned_model_id": svc.support.aligned_model_id,
            "base_model_id": svc.support.base_model_id}


@router.get("/v1/pipeline/runs")
async def runs(_: Authed, svc: Services, limit: int = 10) -> list[dict[str, Any]]:
    async with svc.session_factory() as s:
        rows = (await s.scalars(select(AlignmentRun).order_by(AlignmentRun.created_at.desc())
                                .limit(min(limit, 50)))).all()
        out = []
        for r in rows:
            events = (await s.scalars(select(RunEvent).where(RunEvent.run_id == r.id)
                                      .order_by(RunEvent.id))).all()
            out.append({
                "id": str(r.id), "name": r.name, "kind": r.kind, "state": r.state.value,
                "base_model_id": r.base_model_id, "document_ids": r.document_ids,
                "document_names": r.document_names, "benchmark_id": r.benchmark_id,
                "alignment_id": r.alignment_id, "alignment_status": r.alignment_status,
                "evaluation_id": r.evaluation_id, "model_id": r.model_id,
                "deployment_status": r.deployment_status, "last_error": r.last_error,
                "parent_run_id": str(r.parent_run_id) if r.parent_run_id else None,
                "created_at": r.created_at.isoformat(), "updated_at": r.updated_at.isoformat(),
                "events": [{"step": e.step, "status": e.status, "detail": e.detail,
                            "at": e.at.isoformat()} for e in events],
            })
        return out


class AlignRequest(BaseModel):
    confirm: bool = False
    deploy: bool = False


@router.post("/v1/pipeline/align", status_code=202)
async def enqueue_align(body: AlignRequest, _: Authed, svc: Services) -> dict[str, Any]:
    if svc.arq is None:
        raise HTTPException(503, "job queue unavailable")
    job = await svc.arq.enqueue_job("run_alignment", confirm=body.confirm, deploy=body.deploy,
                                    _job_id=f"align:{'confirm' if body.confirm else 'prep'}")
    if job is None:
        return {"status": "already_queued"}
    return {"status": "queued", "job_id": job.job_id}


@router.post("/v1/pipeline/deploy", status_code=202)
async def enqueue_deploy(_: Authed, svc: Services) -> dict[str, Any]:
    if svc.arq is None:
        raise HTTPException(503, "job queue unavailable")
    job = await svc.arq.enqueue_job("run_deploy", _job_id="deploy:latest")
    return {"status": "queued" if job else "already_queued",
            "job_id": job.job_id if job else None}


@router.get("/v1/spend")
async def spend(_: Authed, svc: Services) -> dict[str, Any]:
    from app.config import get_settings

    s = get_settings()
    tracker = SpendTracker(svc.session_factory, s.nugen_price_per_mtok_usd,
                           s.nugen_spend_hard_limit_usd)
    rows = await tracker.summary()
    return {"total_est_usd": round(sum(r["est_cost_usd"] for r in rows), 6),
            "hard_limit_usd": s.nugen_spend_hard_limit_usd, "breakdown": rows}
