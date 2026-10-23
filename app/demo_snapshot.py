"""Static snapshot of every read-only endpoint, served by the UI while the API wakes up.

    python -m app.demo_snapshot     # -> ui/public/demo-snapshot.json (from the LOCAL db)

Responses come from the real FastAPI routes running in demo mode in-process, so the shapes
are exactly what the live API returns.
"""

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import typer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import ROOT, Settings, get_settings
from app.db import get_session_factory

OUT = ROOT / "ui" / "public" / "demo-snapshot.json"
READ_PATHS = ["/v1/models", "/v1/pipeline/runs", "/v1/spend", "/v1/eval/latest",
              "/v1/eval/history", "/v1/feedback/flagged", "/v1/feedback/stats",
              "/v1/realign/dataset", "/v1/demo/status"]


class _NoModel:
    """Snapshotting never calls a model."""

    async def chat(self, *a: Any, **k: Any) -> Any:
        raise RuntimeError("no model calls while snapshotting")

    def stream_chat(self, *a: Any, **k: Any) -> Any:
        raise RuntimeError("no model calls while snapshotting")


async def build_snapshot(session_factory: async_sessionmaker[AsyncSession], *,
                         base_model_id: str, redis_url: str = "redis://localhost:6379/15"
                         ) -> dict[str, Any]:
    from app.api.main import AppServices, create_app
    from app.demo import DemoBudget
    from app.support.service import SupportService

    settings = Settings(demo_mode=True, demo_access_code="snapshot-only",
                        nugen_base_model_id=base_model_id, client_api_keys="snapshot-only")
    redis: Redis = Redis.from_url(redis_url, decode_responses=True)
    budget = DemoBudget(redis, settings.nugen_price_per_mtok_usd, settings.demo_daily_cap_usd)
    support = SupportService(client=_NoModel(), cache=None,
                             aligned_model_id=None, base_model_id=base_model_id)
    app = create_app(settings, AppServices(redis=redis, session_factory=session_factory,
                                           support=support, nugen=None, demo_budget=budget))
    responses: dict[str, Any] = {}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://snapshot") as c:
        for path in READ_PATHS:
            r = await c.get(path, params={"limit": 25} if path == "/v1/pipeline/runs" else None)
            if r.status_code == 200:
                responses[path] = r.json()
        for entry in responses.get("/v1/eval/history", []):
            path = f"/v1/eval/runs/{entry['id']}"
            responses[path] = (await c.get(path)).json()
    status = responses.get("/v1/demo/status")
    if status:  # a static file can't know today's live spend
        status.update(spent_today_usd=0.0, limit_reached=False)
    await redis.aclose()
    return {"generated_at": datetime.now(UTC).isoformat(),
            "source": "local database (real runs, evals and feedback)", "responses": responses}


cli = typer.Typer(add_completion=False)


@cli.command()
def main(out: Path = typer.Option(OUT), base_model: str = typer.Option(
        "meta-llama/Llama-3.2-3B-Instruct", help="Base model the demo API serves")) -> None:
    async def run() -> dict[str, Any]:
        from app.demo_seed import import_report

        sf = get_session_factory()
        rescore = ROOT / "reports" / "eval_exp3_rescored.json"
        if rescore.exists() and await import_report(sf, rescore):
            typer.echo(f"imported {rescore.name} into the local DB as an eval run")
        return await build_snapshot(sf, base_model_id=base_model,
                                    redis_url=get_settings().redis_url)

    snap = asyncio.run(run())
    out.write_text(json.dumps(snap, indent=1))
    typer.echo(f"wrote {out} ({out.stat().st_size // 1024} KB, "
               f"{len(snap['responses'])} endpoints)")


if __name__ == "__main__":
    cli()
