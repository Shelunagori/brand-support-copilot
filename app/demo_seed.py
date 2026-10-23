"""Seed the public-demo database with the REAL data from the local database.

    python -m app.demo_seed --yes          # target = DEMO_DATABASE_URL (from .env / env)

Steps: run Alembic migrations on the target, then replace every table's rows with the
source's rows (FK order, integer sequences reset). The target is wiped first, so it must
be the dedicated demo database.
"""

import asyncio
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import typer
from sqlalchemy import Integer, select, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

import app.models  # noqa: F401  (register tables)
from app.config import ROOT, get_settings, normalize_database_url
from app.db import Base, engine_kwargs
from app.models import EvalRun

cli = typer.Typer(add_completion=False)


async def copy_database(src: AsyncEngine, dst: AsyncEngine) -> dict[str, int]:
    tables = list(Base.metadata.sorted_tables)  # parents before children
    counts: dict[str, int] = {}
    async with src.connect() as sc, dst.begin() as dc:
        for t in reversed(tables):
            await dc.execute(t.delete())
        for t in tables:
            rows = [dict(r) for r in (await sc.execute(t.select())).mappings().all()]
            if "created_at" in t.c:  # self-referencing rows (re-align -> parent) need order
                rows.sort(key=lambda r: r["created_at"])
            if rows:
                await dc.execute(t.insert(), rows)
            counts[t.name] = len(rows)
        for t in tables:
            pk = list(t.primary_key.columns)
            if len(pk) == 1 and isinstance(pk[0].type, Integer):
                col = pk[0].name
                await dc.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{t.name}', '{col}'), "
                    f"COALESCE((SELECT MAX({col}) FROM {t.name}), 0) + 1, false)"))
    return counts


async def import_report(session_factory: async_sessionmaker[AsyncSession], path: Path) -> bool:
    """Store a saved report (e.g. the offline re-score) as an eval run. Idempotent by label."""
    report: dict[str, Any] = json.loads(await asyncio.to_thread(path.read_text))
    async with session_factory() as s:
        if await s.scalar(select(EvalRun.id).where(EvalRun.label == report["label"])):
            return False
        s.add(EvalRun(label=report["label"], summary=report["summary"], report=report,
                      created_at=datetime.fromisoformat(report["generated_at"])))
        await s.commit()
    return True


def _migrate(url: str) -> None:
    env = {**os.environ, "DATABASE_URL": url}
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=ROOT, env=env,
                   check=True)


@cli.command()
def main(
    yes: bool = typer.Option(False, "--yes", help="Confirm wiping and reseeding the target."),
    rescore_report: Path = typer.Option(ROOT / "reports" / "eval_exp3_rescored.json"),
) -> None:
    settings = get_settings()
    target = normalize_database_url(os.environ.get("DEMO_DATABASE_URL")
                                    or settings.demo_database_url.get_secret_value())
    if not target:
        raise typer.BadParameter("set DEMO_DATABASE_URL (Neon connection string) in .env")
    if target == settings.database_url:
        raise typer.BadParameter("DEMO_DATABASE_URL must differ from DATABASE_URL")
    host = target.split("@")[-1].split("/")[0]
    typer.echo(f"source: local DATABASE_URL -> target host: {host}")
    if not yes:
        raise typer.BadParameter("this wipes the target's tables; re-run with --yes")

    async def run() -> None:
        src = create_async_engine(settings.database_url)
        src_sf = async_sessionmaker(src, expire_on_commit=False)
        exists = await asyncio.to_thread(rescore_report.exists)
        if exists and await import_report(src_sf, rescore_report):
            typer.echo(f"imported {rescore_report.name} into the local DB as an eval run")
        dst = create_async_engine(target, **engine_kwargs(target))
        counts = await copy_database(src, dst)
        await src.dispose()
        await dst.dispose()
        for name, n in counts.items():
            typer.echo(f"  {name:<16} {n:>5} rows")

    _migrate(target)
    asyncio.run(run())
    typer.echo("demo database seeded")


if __name__ == "__main__":
    cli()
