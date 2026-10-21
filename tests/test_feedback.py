from pathlib import Path

import pytest
from sqlalchemy import select

from app.config import Settings
from app.feedback import (
    FeedbackService,
    InferenceLogger,
    RealignDatasetTooSmall,
    auto_flags,
    build_realign_dataset,
)
from app.models import InferenceLog
from app.support.schema import SupportResponse


def resp(**kw: object) -> SupportResponse:
    base: dict[str, object] = dict(intent="returns", answer="7 days.", policy_ref="UT-RET-001",
                                   escalate_to_human=False, confidence=0.9, model_id="m",
                                   latency_ms=10, model_escalate=False)
    base.update(kw)
    return SupportResponse.model_validate(base)


def test_auto_flags() -> None:
    assert auto_flags(resp(), 0.5) == []
    assert "low_confidence" in auto_flags(resp(confidence=0.2), 0.5)
    assert "invalid_json" in auto_flags(resp(json_valid_first_try=False), 0.5)
    assert "fallback" in auto_flags(resp(fallback=True), 0.5)
    flags = auto_flags(resp(escalate_to_human=True, model_escalate=False,
                            guardrail_triggers=["chargeback"]), 0.5)
    assert "wrong_escalation" in flags


async def test_logger_persists_and_flags(session_factory) -> None:  # type: ignore[no-untyped-def]
    logger = InferenceLogger(session_factory, Settings())
    inf_id = await logger.record("Return window?", resp(confidence=0.1))
    async with session_factory() as s:
        row = await s.get(InferenceLog, inf_id)
    assert row is not None and row.flags == ["low_confidence"] and row.query == "Return window?"


async def test_thumbs_down_with_correction_flags_item(session_factory) -> None:  # type: ignore[no-untyped-def]
    logger = InferenceLogger(session_factory, Settings())
    svc = FeedbackService(session_factory)
    inf_id = await logger.record("Can I exchange socks?", resp(answer="Yes, within 15 days."))
    fb = await svc.submit(inf_id, rating="down",
                          correction="Socks cannot be returned or exchanged (UT-NRT-003).")
    assert fb["flagged"] is True
    flagged = await svc.flagged()
    assert flagged[0]["flags"] == ["thumbs_down"]
    assert flagged[0]["correction"].startswith("Socks cannot")
    stats = await svc.stats()
    assert stats["thumbs_down"] == 1 and stats["corrections"] == 1


async def test_feedback_for_unknown_inference_raises(session_factory) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(KeyError):
        await FeedbackService(session_factory).submit("00000000-0000-0000-0000-000000000000",
                                                      rating="up")


async def test_realign_dataset_from_corrections(session_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    logger = InferenceLogger(session_factory, Settings())
    svc = FeedbackService(session_factory)
    long_fix = ("Socks, innerwear and Final Sale items cannot be returned or exchanged under "
                "policy UT-NRT-003, for hygiene reasons. ") * 4
    for i in range(12):
        inf = await logger.record(f"question {i} about socks exchange", resp(answer="Yes"))
        await svc.submit(inf, rating="down", correction=long_fix)
    # missed escalation without a human correction is still included, with a templated answer
    await logger.record("I'm doing a chargeback", resp(escalate_to_human=True,
                                                       model_escalate=False,
                                                       guardrail_triggers=["chargeback"]))
    ds = await build_realign_dataset(session_factory, tmp_path)
    assert ds.count == 13
    assert ds.path.exists() and len(ds.path.read_text().split()) >= 500
    sources = {i["source"] for i in ds.items}
    assert sources == {"human_correction", "missed_escalation"}


async def test_realign_dataset_too_small(session_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(RealignDatasetTooSmall):
        await build_realign_dataset(session_factory, tmp_path)


async def test_logged_queries_listed_newest_first(session_factory) -> None:  # type: ignore[no-untyped-def]
    logger = InferenceLogger(session_factory, Settings())
    await logger.record("a", resp())
    await logger.record("b", resp())
    async with session_factory() as s:
        rows = (await s.scalars(select(InferenceLog).order_by(InferenceLog.created_at))).all()
    assert [r.query for r in rows] == ["a", "b"]
