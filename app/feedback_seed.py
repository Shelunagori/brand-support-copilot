"""Simulated reviewer pass: `python -m app.feedback_seed`.

Sends the queries in data/feedback/seed.jsonl (distinct from the held-out eval set) to the
deployed aligned model through the normal answering path, so each one is a real, logged
inference. Where the answer misses a required fact (or a required escalation), it files a
thumbs-down with the reviewer's correction, exactly as a support lead would in the UI.
"""

import asyncio
import json

import typer

from app.config import ROOT, get_settings
from app.db import get_session_factory
from app.eval.__main__ import _aligned_model_id
from app.eval.scoring import normalize_text
from app.feedback import FeedbackService, InferenceLogger
from app.logging_setup import configure_logging
from app.runtime import build_client, build_spend
from app.support.service import SupportService

SEED_PATH = ROOT / "data" / "feedback" / "seed.jsonl"


def needs_correction(answer: str, escalated: bool, expected_facts: list[str]) -> bool:
    text = normalize_text(answer)
    for fact in expected_facts:
        if fact == "escalat":
            if not escalated:
                return True
        elif normalize_text(fact) not in text:
            return True
    return False


def main() -> None:
    settings = get_settings()
    configure_logging("WARNING")

    async def run() -> None:
        items = [json.loads(line) for line in SEED_PATH.read_text().splitlines() if line.strip()]
        sf = get_session_factory()
        fb = FeedbackService(sf)
        async with build_client(settings, build_spend(settings)) as client:
            model_id = await _aligned_model_id()
            if not model_id:
                raise typer.BadParameter("no deployed aligned model")
            svc = SupportService(client=client, cache=None, aligned_model_id=model_id,
                                 base_model_id=settings.nugen_base_model_id,
                                 recorder=InferenceLogger(sf, settings), purpose="feedback_seed")
            corrected = 0
            for it in items:
                r = await svc.answer(it["query"], use_cache=False)
                assert r.inference_id
                if needs_correction(r.answer, r.escalate_to_human, it["expected_facts"]):
                    await fb.submit(r.inference_id, rating="down", correction=it["correction"],
                                    comment="reviewer seed")
                    corrected += 1
                else:
                    await fb.submit(r.inference_id, rating="up")
        typer.echo(f"seeded {len(items)} real inferences; {corrected} corrected (thumbs down)")

    asyncio.run(run())


if __name__ == "__main__":
    typer.run(main)
