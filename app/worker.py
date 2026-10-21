"""arq worker: long-running alignment / deploy jobs (and scheduled re-alignment, phase 4).

Run with: `arq app.worker.WorkerSettings`
"""

from typing import Any, ClassVar
from urllib.parse import urlparse

from arq.connections import RedisSettings

from app.config import get_settings
from app.logging_setup import configure_logging
from app.runtime import build_client, build_pipeline


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


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging(get_settings().log_level)


class WorkerSettings:
    functions: ClassVar[list[Any]] = [run_alignment, run_deploy]
    on_startup = startup
    redis_settings = redis_settings(get_settings().redis_url)
    job_timeout = 4 * 3600  # alignment polling can take hours
    max_jobs = 4
