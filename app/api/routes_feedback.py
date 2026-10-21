from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import Authed, Services
from app.config import ROOT
from app.feedback import (
    FeedbackService,
    RealignDatasetTooSmall,
    build_realign_dataset,
    collect_realign_items,
)

router = APIRouter(prefix="/v1", tags=["feedback"])
REALIGN_DIR = ROOT / "var" / "realign"


class FeedbackIn(BaseModel):
    inference_id: str
    rating: Literal["up", "down"]
    correction: str | None = Field(default=None, max_length=4000)
    comment: str | None = Field(default=None, max_length=2000)


@router.post("/feedback", status_code=201)
async def submit(body: FeedbackIn, _: Authed, svc: Services) -> dict[str, Any]:
    try:
        return await FeedbackService(svc.session_factory).submit(
            body.inference_id, rating=body.rating, correction=body.correction,
            comment=body.comment)
    except (KeyError, ValueError) as exc:
        raise HTTPException(404, "unknown inference_id") from exc


@router.get("/feedback/flagged")
async def flagged(_: Authed, svc: Services, limit: int = 50) -> list[dict[str, Any]]:
    return await FeedbackService(svc.session_factory).flagged(min(limit, 200))


@router.get("/feedback/stats")
async def stats(_: Authed, svc: Services) -> dict[str, Any]:
    return await FeedbackService(svc.session_factory).stats()


@router.get("/realign/dataset")
async def dataset(_: Authed, svc: Services) -> dict[str, Any]:
    items = await collect_realign_items(svc.session_factory)
    return {"items": items, "count": len(items)}


class RealignIn(BaseModel):
    confirm: bool = False
    deploy: bool = True


@router.post("/realign", status_code=202)
async def realign(body: RealignIn, _: Authed, svc: Services) -> dict[str, Any]:
    try:
        ds = await build_realign_dataset(svc.session_factory, REALIGN_DIR)
    except RealignDatasetTooSmall as exc:
        raise HTTPException(409, str(exc)) from exc
    if svc.arq is None:
        raise HTTPException(503, "job queue unavailable")
    job = await svc.arq.enqueue_job("run_realign", dataset_path=str(ds.path),
                                    confirm=body.confirm, deploy=body.deploy,
                                    _job_id=f"realign:{ds.path.stem}:{body.confirm}")
    return {"status": "queued" if job else "already_queued",
            "job_id": job.job_id if job else None, "dataset_items": ds.count,
            "dataset_path": ds.path.name}
