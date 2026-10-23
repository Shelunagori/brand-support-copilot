"""`python -m app.eval run --models base,aligned --label "initial alignment"`"""

import asyncio
from typing import Literal, cast

import typer
from sqlalchemy import select

from app.config import get_pricing, get_settings
from app.db import get_session_factory
from app.eval.runner import render_markdown, run_eval
from app.eval.scoring import load_questions
from app.logging_setup import configure_logging
from app.models import AlignmentRun, RunState
from app.runtime import build_client, build_spend
from app.support.service import SupportService

cli = typer.Typer(no_args_is_help=True, add_completion=False)


@cli.callback()
def _group() -> None:
    """Eval harness (keeps `run` as an explicit subcommand)."""


async def _aligned_model_id() -> str | None:
    s = get_settings()
    if s.aligned_model_id:
        return s.aligned_model_id
    async with get_session_factory()() as sess:
        runs = (await sess.scalars(select(AlignmentRun)
                                   .where(AlignmentRun.model_id.is_not(None)))).all()
    for r in runs:  # price each aligned model on its base model's tier
        get_pricing().register_aligned(r.model_id, r.base_model_id)  # type: ignore[arg-type]
    live = sorted((r for r in runs if r.state == RunState.DEPLOYED), key=lambda r: r.updated_at)
    return live[-1].model_id if live else None


@cli.command()
def run(
    models: str = typer.Option("base,aligned", help="Comma-separated: base,aligned"),
    label: str = typer.Option("eval", help="Label stored with the run"),
    limit: int = typer.Option(0, help="Only the first N questions (0 = all)"),
    concurrency: int = typer.Option(4),
    aligned_model: str | None = typer.Option(None, help="Aligned model id (default: latest "
                                             "DEPLOYED run)"),
    base_model: str | None = typer.Option(None, help="Override NUGEN_BASE_MODEL_ID"),
) -> None:
    """Run the held-out eval and write reports/eval_report.md + eval_latest.json."""
    settings = get_settings()
    configure_logging("WARNING")
    kinds = [cast(Literal["aligned", "base"], k.strip()) for k in models.split(",") if k.strip()]

    async def main() -> None:
        questions = load_questions(settings.eval_path)
        if limit:
            questions = questions[:limit]
        spend = build_spend(settings)
        async with build_client(settings, spend) as client:
            svc = SupportService(client=client, cache=None,
                                 aligned_model_id=aligned_model or await _aligned_model_id(),
                                 base_model_id=base_model or settings.nugen_base_model_id,
                                 purpose="eval")
            if "aligned" in kinds and not svc.aligned_model_id:
                raise typer.BadParameter("no deployed aligned model; run align + deploy first, "
                                         "or pass --models base")
            report = await run_eval(service=svc, questions=questions, kinds=kinds, label=label,
                                    price_per_mtok=get_pricing().usd_per_mtok,
                                    reports_dir=settings.reports_dir,
                                    session_factory=get_session_factory(),
                                    concurrency=concurrency)
        total = await spend.total_usd()
        md = render_markdown(report, spend_total_usd=total)
        (settings.reports_dir / "eval_report.md").write_text(md)
        typer.echo(md.split("## Accuracy by category")[0])

    asyncio.run(main())


@cli.command()
def rescore(
    report: str = typer.Argument(..., help="Saved eval JSON, e.g. reports/eval_<ts>.json"),
    label: str = typer.Option(..., help="Label for the re-scored report"),
    out: str = typer.Option(..., help="Output stem, e.g. reports/eval_exp3_rescored"),
) -> None:
    """Re-score a SAVED report with the current parser (no API calls, $0)."""
    import json
    from pathlib import Path

    from app.eval.rescore import rescore_result
    from app.eval.runner import build_report, render_markdown
    from app.eval.scoring import summarize

    settings = get_settings()
    saved = json.loads(Path(report).read_text())
    questions = {q.id: q for q in load_questions(settings.eval_path)}
    qs = [questions[q["id"]] for q in saved["questions"]]
    results, summaries = {}, {}
    for kind, summ in saved["summary"].items():
        model_id = summ["model_id"]
        results[kind] = [rescore_result(questions[q["id"]], q["results"][kind], model_id)
                         for q in saved["questions"]]
        summaries[kind] = summarize(model_id, results[kind], get_pricing().usd_per_mtok(model_id))
    new = build_report(qs, results, summaries, label)
    new["rescored_from"] = Path(report).name
    Path(f"{out}.json").write_text(json.dumps(new, indent=2))
    Path(f"{out}.md").write_text(render_markdown(new))
    typer.echo(render_markdown(new).split("## Accuracy by category")[0])


if __name__ == "__main__":
    cli()
