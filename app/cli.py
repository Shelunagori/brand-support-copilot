"""Operator CLI: `python -m app.cli align|status|deploy|models|smoke|spend`."""

import asyncio
import uuid
from collections.abc import Coroutine
from typing import Any

import typer
from sqlalchemy import select

from app.config import get_settings
from app.db import get_session_factory
from app.logging_setup import configure_logging
from app.models import AlignmentRun, RunEvent
from app.nugen.schemas import ChatMessage
from app.runtime import build_client, build_pipeline, build_spend

cli = typer.Typer(no_args_is_help=True, add_completion=False)


def _run(coro: Coroutine[Any, Any, None]) -> None:
    configure_logging(get_settings().log_level)
    asyncio.run(coro)


def _print_event(step: str, status: str, detail: dict[str, Any]) -> None:
    extras = " ".join(f"{k}={v}" for k, v in detail.items())
    typer.echo(f"  -> {step:<18} {status:<22} {extras}")


@cli.command()
def models() -> None:
    """List alignment-ready base models (free call)."""

    async def main() -> None:
        async with build_client() as c:
            for m in await c.list_base_models(alignment_ready=True):
                typer.echo(f"{m.model_id:<55} {m.parameters or '':>8} "
                           f"inference_ready={m.inference_ready} type={m.type}")

    _run(main())


@cli.command()
def align(
    yes: bool = typer.Option(False, "--yes", help="Confirm the paid alignment run."),
    poll_interval: float = typer.Option(15.0, help="Seconds between status polls."),
    base_model: str | None = typer.Option(None, help="Override NUGEN_BASE_MODEL_ID."),
    active_only: bool = typer.Option(False, "--active-only",
                                     help="Only docs with `Status: ACTIVE` (no distractors)."),
) -> None:
    """Upload docs + benchmark, then (with --yes) start alignment and wait until it is READY."""

    async def main() -> None:
        async with build_client() as c:
            pipe = build_pipeline(c, poll_interval=poll_interval, base_model_id=base_model,
                                  active_only=active_only)
            pipe.on_event = _print_event
            run = await pipe.align(confirm=yes)
            typer.echo(f"run={run.id} state={run.state} alignment_id={run.alignment_id} "
                       f"model_id={run.model_id}")
            if not yes and run.alignment_id is None:
                typer.echo("Docs + benchmark are ready. Re-run with --yes to start the paid "
                           "alignment.")

    _run(main())


@cli.command()
def deploy(run_id: str | None = typer.Option(None, help="Defaults to the latest aligned run."),
           poll_interval: float = 15.0) -> None:
    """Deploy the aligned model and wait until it serves inference."""

    async def main() -> None:
        async with build_client() as c:
            pipe = build_pipeline(c, poll_interval=poll_interval)
            pipe.on_event = _print_event
            run = await pipe.deploy(uuid.UUID(run_id) if run_id else None)
            typer.echo(f"run={run.id} state={run.state} model_id={run.model_id} "
                       f"deployment={run.deployment_status}")

    _run(main())


@cli.command()
def status(refresh: bool = typer.Option(False, help="Also query Nugen for live status.")) -> None:
    """Show pipeline runs and their step timeline."""

    async def main() -> None:
        async with get_session_factory()() as s:
            runs = (await s.scalars(select(AlignmentRun)
                                    .order_by(AlignmentRun.created_at.desc()).limit(5))).all()
            if not runs:
                typer.echo("no runs yet")
            for r in runs:
                typer.echo(f"\n{r.name} [{r.kind}] state={r.state} model_id={r.model_id} "
                           f"alignment_id={r.alignment_id} error={r.last_error}")
                events = (await s.scalars(select(RunEvent).where(RunEvent.run_id == r.id)
                                          .order_by(RunEvent.id))).all()
                for e in events:
                    typer.echo(f"  {e.at:%H:%M:%S} {e.step:<18} {e.status:<22} {e.detail or ''}")
                if refresh and r.alignment_id:
                    async with build_client() as c:
                        live = await c.get_alignment_status(r.alignment_id)
                        typer.echo(f"  live alignment status: {live.status}")
                        if r.model_id:
                            dep = await c.get_deployment_status(r.model_id)
                            typer.echo(f"  live deployment status: {dep.status} {dep.error or ''}")

    _run(main())


@cli.command()
def undeploy(model_id: str) -> None:
    """Undeploy an aligned model (frees a deployment slot)."""

    async def main() -> None:
        async with build_client() as c:
            typer.echo(await c.undeploy_model(model_id))

    _run(main())


@cli.command()
def smoke(model: str = typer.Option(None, help="Defaults to NUGEN_BASE_MODEL_ID.")) -> None:
    """One tiny paid inference call to verify the key and endpoint."""

    async def main() -> None:
        async with build_client() as c:
            res = await c.chat(model or get_settings().nugen_base_model_id,
                               [ChatMessage(role="user", content="Reply with the word: ok")],
                               max_tokens=5, purpose="smoke")
            typer.echo(f"model={res.model} reply={res.content!r} usage={res.usage.model_dump()} "
                       f"confidence={res.confidence_score} latency_ms={res.latency_ms:.0f}")

    _run(main())


@cli.command()
def realign(yes: bool = typer.Option(False, "--yes", help="Confirm the paid alignment run."),
            deploy_after: bool = typer.Option(True, "--deploy/--no-deploy")) -> None:
    """Build the corrections dataset from feedback and re-align (manual trigger)."""
    from app.feedback import build_realign_dataset
    from app.worker import REALIGN_DIR, run_realign

    async def main() -> None:
        ds = await build_realign_dataset(get_session_factory(), REALIGN_DIR)
        typer.echo(f"dataset: {ds.count} items -> {ds.path.name}")
        typer.echo(str(await run_realign({}, str(ds.path), confirm=yes, deploy=deploy_after)))

    _run(main())


@cli.command("wait-api")
def wait_api(timeout_min: float = typer.Option(60.0), interval_s: float = 30.0) -> None:
    """Block until api.nugen.in/health returns 200 (exit 1 on timeout)."""
    import time

    import httpx

    url = get_settings().nugen_base_url.rstrip("/") + "/health"
    deadline = time.monotonic() + timeout_min * 60
    while True:
        try:
            code = httpx.get(url, timeout=25).status_code
        except httpx.HTTPError as exc:
            code = type(exc).__name__  # type: ignore[assignment]
        typer.echo(f"{time.strftime('%H:%M:%S')} {url} -> {code}")
        if code == 200:
            return
        if time.monotonic() > deadline:
            raise typer.Exit(1)
        time.sleep(interval_s)


@cli.command()
def estimate(alignments: int = typer.Option(2, help="initial + re-align"),
             eval_calls: int = typer.Option(120, help="40 q x (base+aligned) + 40 after re-align"),
             other_calls: int = typer.Option(30, help="smoke + feedback seed + demo"),
             tokens_per_call: int = typer.Option(750),
             repair_factor: float = typer.Option(1.3)) -> None:
    """Estimate the full run's cost, log it to the spend log, exit 2 if over the cap."""
    from app.models import SpendEntry

    s = get_settings()

    async def main() -> None:
        tokens = int((eval_calls + other_calls) * tokens_per_call * repair_factor)
        inference = tokens / 1_000_000 * s.nugen_price_per_mtok_usd
        align = alignments * s.nugen_alignment_cost_est_usd
        spent = await build_spend(s).total_usd()
        total = spent + inference + align
        note = (f"ESTIMATE (not a charge): {alignments} alignments x "
                f"${s.nugen_alignment_cost_est_usd:.2f} + ~{tokens:,} inference tokens "
                f"(${inference:.4f}) + already spent ${spent:.4f} = ${total:.2f} "
                f"vs cap ${s.nugen_spend_hard_limit_usd:.2f}")
        async with get_session_factory()() as sess:
            sess.add(SpendEntry(endpoint="(estimate)", purpose="estimate", est_cost_usd=0.0,
                                note=note))
            await sess.commit()
        typer.echo(note)
        if total > s.nugen_spend_hard_limit_usd:
            typer.echo("HARD STOP: estimate exceeds the spend cap")
            raise typer.Exit(2)

    _run(main())


@cli.command()
def reconcile(billed_total_usd: float = typer.Argument(..., help="Lifetime spend from billing"),
              note: str = typer.Option("platform billing")) -> None:
    """Correct the spend log to the platform-billed lifetime total."""

    async def main() -> None:
        delta = await build_spend().reconcile(billed_total_usd, note)
        typer.echo(f"reconciled: {delta:+.4f} USD -> total ${billed_total_usd:.2f}")

    _run(main())


@cli.command()
def spend() -> None:
    """Spend log summary."""

    async def main() -> None:
        tracker = build_spend()
        total = 0.0
        for row in await tracker.summary():
            total += row["est_cost_usd"]
            typer.echo(f"{row['purpose'] or '-':<12} {row['endpoint']:<45} calls={row['calls']:<5}"
                       f" tokens={row['tokens']:<8} est=${row['est_cost_usd']:.4f}")
        typer.echo(f"TOTAL est=${total:.4f} (limit ${get_settings().nugen_spend_hard_limit_usd})")

    _run(main())


if __name__ == "__main__":
    cli()
