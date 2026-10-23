"""Run the held-out eval against base and aligned models and write reports."""

import asyncio
import json
from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.eval.scoring import (
    EvalQuestion,
    ModelSummary,
    QuestionResult,
    score,
    summarize,
)
from app.models import EvalRun
from app.support.service import SupportService

ModelKind = Literal["aligned", "base"]
METRICS: list[tuple[str, str, str]] = [
    ("factual_accuracy", "Factual accuracy", "pct"),
    ("policy_violation_rate", "Policy violations (lower is better)", "pct"),
    ("escalation_accuracy", "Escalation correctness (with guardrails)", "pct"),
    ("model_escalation_accuracy", "Escalation correctness (model only)", "pct"),
    ("json_validity", "JSON valid on first try", "pct"),
    ("json_validity_final", "JSON valid after repair", "pct"),
    ("policy_ref_accuracy", "Correct policy_ref", "pct"),
    ("latency_p50_ms", "Latency p50 (ms)", "ms"),
    ("latency_p95_ms", "Latency p95 (ms)", "ms"),
    ("total_tokens", "Total tokens", "int"),
    ("est_cost_usd", "Est. cost (USD)", "usd"),
]


async def run_model(service: SupportService, kind: ModelKind, questions: list[EvalQuestion],
                    concurrency: int = 4) -> list[QuestionResult]:
    sem = asyncio.Semaphore(concurrency)

    async def one(q: EvalQuestion) -> QuestionResult:
        async with sem:
            r = await service.answer(q.question, model_kind=kind, use_cache=False)
            return score(q, r)

    return list(await asyncio.gather(*(one(q) for q in questions)))


def build_report(questions: list[EvalQuestion], results: dict[str, list[QuestionResult]],
                 summaries: dict[str, ModelSummary], label: str) -> dict[str, Any]:
    by_id = {k: {r.question_id: r for r in v} for k, v in results.items()}
    return {
        "label": label,
        "generated_at": datetime.now(UTC).isoformat(),
        "summary": {k: s.model_dump() for k, s in summaries.items()},
        "questions": [
            {
                "id": q.id, "category": q.category, "question": q.question,
                "expected_escalate": q.expected_escalate,
                "expected_policy_ref": q.expected_policy_ref,
                "expected_facts": q.expected_facts, "expected_any": q.expected_any,
                "results": {k: by_id[k][q.id].model_dump() for k in by_id},
            }
            for q in questions
        ],
    }


def _fmt(value: float, kind: str) -> str:
    if kind == "pct":
        return f"{value * 100:.1f}%"
    if kind == "ms":
        return f"{value:,.0f}"
    if kind == "usd":
        return f"${value:.4f}"
    return f"{int(value):,}"


def render_markdown(report: dict[str, Any], spend_total_usd: float | None = None) -> str:
    summary = report["summary"]
    kinds = [k for k in ("base", "aligned") if k in summary]
    lines = [f"# Eval report — {report['label']}", "",
             f"Generated {report['generated_at']} · {len(report['questions'])} held-out "
             "questions · same prompt for every model, no retrieval.", ""]
    lines.append("| Metric | " + " | ".join(f"{k} (`{summary[k]['model_id']}`)" for k in kinds)
                 + (" | Δ aligned − base |" if len(kinds) == 2 else " |"))
    lines.append("|---|" + "---|" * len(kinds) + ("---|" if len(kinds) == 2 else ""))
    for key, name, kind in METRICS:
        row = [_fmt(summary[k][key], kind) for k in kinds]
        if len(kinds) == 2:
            delta = summary["aligned"][key] - summary["base"][key]
            d = f"{delta * 100:+.1f} pp" if kind == "pct" else (
                f"{delta:+,.0f}" if kind in {"ms", "int"} else f"{delta:+.4f}")
            row.append(d)
        lines.append(f"| {name} | " + " | ".join(row) + " |")
    lines += ["", "## Accuracy by category", "",
              "| Category | n | " + " | ".join(kinds) + " |",
              "|---|---|" + "---|" * len(kinds)]
    cats: dict[str, dict[str, list[bool]]] = defaultdict(lambda: defaultdict(list))
    for q in report["questions"]:
        for k in kinds:
            cats[q["category"]][k].append(q["results"][k]["correct"])
    for cat, per in sorted(cats.items()):
        n = len(next(iter(per.values())))
        lines.append(f"| {cat} | {n} | " + " | ".join(
            f"{sum(per[k])}/{n}" for k in kinds) + " |")
    lines += ["", "## Per question", "",
              "| id | category | " + " | ".join(f"{k} correct / esc ok" for k in kinds) + " |",
              "|---|---|" + "---|" * len(kinds)]
    for q in report["questions"]:
        cells = []
        for k in kinds:
            r = q["results"][k]
            ok, esc = ("✅" if r[f] else "❌" for f in ("correct", "escalation_correct"))
            cells.append(f"{ok} / {esc}")
        lines.append(f"| {q['id']} | {q['category']} | " + " | ".join(cells) + " |")
    lines += ["", "## Sample answers (first 8)", ""]
    for q in report["questions"][:8]:
        lines.append(f"**{q['id']}** — {q['question']}")
        for k in kinds:
            r = q["results"][k]
            lines.append(f"- *{k}*: {r['answer'][:300]}  ")
            if r["facts_missed"] or r["violations"]:
                lines.append(f"  missed={r['facts_missed']} violations={r['violations']}")
        lines.append("")
    lines += ["## Scoring", "",
              "- **Factual accuracy**: every expected fact (and one option of each `expected_any` "
              "group) appears in the answer, no forbidden fact appears, and no fallback.",
              "- **Policy violation**: the answer contains a forbidden fact (superseded rule, "
              "refund promise on a marketplace order, made-up exception).",
              "- **Escalation correctness**: `escalate_to_human` equals the expected flag; "
              "reported with and without the deterministic guardrails.",
              "- **JSON validity**: first model output parses into the strict schema; "
              "\"after repair\" counts the one repair retry.",
              "- Latency is end to end through the service (Nugen call + parsing), cache off."]
    if spend_total_usd is not None:
        lines += ["", f"Total estimated Nugen spend so far: ${spend_total_usd:.4f}."]
    return "\n".join(lines) + "\n"


def write_reports(report: dict[str, Any], reports_dir: Path) -> None:
    reports_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    (reports_dir / f"eval_{stamp}.json").write_text(json.dumps(report, indent=2))
    (reports_dir / "eval_latest.json").write_text(json.dumps(report, indent=2))
    (reports_dir / "eval_report.md").write_text(render_markdown(report))


async def run_eval(
    *,
    service: SupportService,
    questions: list[EvalQuestion],
    kinds: list[ModelKind],
    label: str,
    price_per_mtok: float | Callable[[str], float],
    reports_dir: Path,
    session_factory: async_sessionmaker[AsyncSession] | None,
    concurrency: int = 4,
) -> dict[str, Any]:
    results: dict[str, list[QuestionResult]] = {}
    summaries: dict[str, ModelSummary] = {}
    for kind in kinds:
        results[kind] = await run_model(service, kind, questions, concurrency)
        model_id = service.model_for(kind)
        price = price_per_mtok(model_id) if callable(price_per_mtok) else price_per_mtok
        summaries[kind] = summarize(model_id, results[kind], price)
    report = build_report(questions, results, summaries, label)
    await asyncio.to_thread(write_reports, report, reports_dir)
    if session_factory is not None:
        async with session_factory() as s:
            s.add(EvalRun(label=label, summary=report["summary"], report=report))
            await s.commit()
    return report
