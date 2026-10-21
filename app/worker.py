"""arq worker: long-running alignment / deploy jobs (and scheduled re-alignment, phase 4).

Run with: `arq app.worker.WorkerSettings`
"""

import logging
from pathlib import Path
from typing import Any, ClassVar
from urllib.parse import urlparse

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import select

from app.config import ROOT, get_settings
from app.db import get_session_factory
from app.feedback import RealignDatasetTooSmall, build_realign_dataset
from app.logging_setup import configure_logging
from app.models import AlignmentRun, RunState
from app.runtime import build_client, build_pipeline

log = logging.getLogger(__name__)
REALIGN_DIR = ROOT / "var" / "realign"


def redis_settings(url: str) -> RedisSettings:
    u = urlparse(url)
    return RedisSettings(host=u.hostname or "localhost", port=u.port or 6379,
                         database=int((u.path or "/0").lstrip("/") or 0), password=u.password)


async def run_alignment(ctx: dict[str, Any], confirm: bool = False, deploy: bool = False
                        ) -> dict[str, Any]:
    async with build_client() as client:
        pipe = build_pipeline(client)
        run = await pipe.align(confirm=confirm)
        if deploy and run.model_id:
            run = await pipe.deploy(run.id)
        return {"run_id": str(run.id), "state": run.state.value, "model_id": run.model_id}


async def run_deploy(ctx: dict[str, Any]) -> dict[str, Any]:
    async with build_client() as client:
        run = await build_pipeline(client).deploy()
        return {"run_id": str(run.id), "state": run.state.value, "model_id": run.model_id}


async def run_realign(ctx: dict[str, Any], dataset_path: str, confirm: bool = False,
                      deploy: bool = True) -> dict[str, Any]:
    """Re-align on the policy docs + the corrections addendum built from feedback."""
    async with get_session_factory()() as s:
        parent = await s.scalar(select(AlignmentRun)
                                .where(AlignmentRun.state == RunState.DEPLOYED)
                                .order_by(AlignmentRun.updated_at.desc()).limit(1))
    async with build_client() as client:
        pipe = build_pipeline(client)
        run = await pipe.align(confirm=confirm, kind="realign", extra_docs=[Path(dataset_path)],
                               parent_run_id=parent.id if parent else None)
        if confirm and deploy and run.model_id:
            run = await pipe.deploy(run.id)
        return {"run_id": str(run.id), "state": run.state.value, "model_id": run.model_id}


async def scheduled_realign(ctx: dict[str, Any]) -> dict[str, Any]:
    """Nightly: rebuild the dataset; prepare a re-align run if there is new feedback.

    Spending credits on a scheduled run requires AUTO_REALIGN_CONFIRM=true.
    """
    settings = get_settings()
    try:
        ds = await build_realign_dataset(get_session_factory(), REALIGN_DIR)
    except RealignDatasetTooSmall as exc:
        log.info("realign.skipped", extra={"reason": str(exc)})
        return {"status": "skipped", "reason": "not enough feedback"}
    async with get_session_factory()() as s:
        used = (await s.scalars(select(AlignmentRun.document_names)
                                .where(AlignmentRun.kind == "realign"))).all()
    if any(names and ds.path.name in names for names in used):
        return {"status": "skipped", "reason": "no new feedback since last re-align"}
    return await run_realign(ctx, str(ds.path), confirm=settings.auto_realign_confirm)


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging(get_settings().log_level)


class WorkerSettings:
    functions: ClassVar[list[Any]] = [run_alignment, run_deploy, run_realign]
    cron_jobs: ClassVar[list[Any]] = [cron(scheduled_realign, hour={2}, minute={0},
                                           run_at_startup=False)]
    on_startup = startup
    redis_settings = redis_settings(get_settings().redis_url)
    job_timeout = 4 * 3600  # alignment polling can take hours
    max_jobs = 4
