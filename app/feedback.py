"""Production feedback loop: inference log -> auto-flags + human feedback -> re-alignment data."""

import asyncio
import hashlib
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.models import Feedback, InferenceLog
from app.pipeline import MIN_WORDS
from app.support.schema import SupportResponse

_POLICY_REF = re.compile(r"UT-[A-Z]{3}-\d{3}")
ESCALATION_TEMPLATE = (
    "I'm sorry about this. I'm escalating your case to a senior member of our support team, "
    "who will contact you within 24 hours. As per policy UT-ESC-012, cases involving legal "
    "notices, chargebacks, orders above ₹25,000, abusive messages or anything outside our "
    "policies are handled by a human specialist."
)


def auto_flags(r: SupportResponse, low_confidence_threshold: float) -> list[str]:
    flags: list[str] = []
    if r.fallback:
        flags.append("fallback")
    if not r.json_valid_first_try:
        flags.append("invalid_json")
    if not r.fallback and r.confidence < low_confidence_threshold:
        flags.append("low_confidence")
    if r.guardrail_triggers and r.model_escalate is False:
        flags.append("wrong_escalation")  # a hard escalation rule fired; the model missed it
    return flags


class InferenceLogger:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession],
                 settings: Settings) -> None:
        self._sf = session_factory
        self._threshold = settings.low_confidence_threshold

    async def record(self, query: str, response: SupportResponse) -> str:
        row = InferenceLog(
            request_id=response.request_id, query=query, answer=response.answer,
            intent=response.intent, policy_ref=response.policy_ref,
            escalate_to_human=response.escalate_to_human, model_escalate=response.model_escalate,
            confidence=response.confidence, model_id=response.model_id,
            model_kind=response.model_kind, latency_ms=response.latency_ms,
            json_valid_first_try=response.json_valid_first_try, repaired=response.repaired,
            fallback=response.fallback, cached=response.cached,
            guardrail_triggers=response.guardrail_triggers,
            flags=auto_flags(response, self._threshold), raw_output=response.raw_output,
            error=response.error, total_tokens=response.total_tokens,
        )
        async with self._sf() as s:
            s.add(row)
            await s.commit()
        return str(row.id)


class FeedbackService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sf = session_factory

    async def submit(self, inference_id: str, *, rating: str, correction: str | None = None,
                     comment: str | None = None) -> dict[str, Any]:
        iid = uuid.UUID(inference_id)
        async with self._sf() as s:
            inf = await s.get(InferenceLog, iid)
            if inf is None:
                raise KeyError(inference_id)
            fb = Feedback(inference_id=iid, rating=rating,
                          correction=(correction or "").strip() or None, comment=comment)
            s.add(fb)
            if rating == "down" and "thumbs_down" not in inf.flags:
                inf.flags = [*inf.flags, "thumbs_down"]
            await s.commit()
            return {"id": str(fb.id), "flagged": bool(inf.flags)}

    async def flagged(self, limit: int = 50) -> list[dict[str, Any]]:
        async with self._sf() as s:
            rows = (await s.scalars(
                select(InferenceLog)
                .where(func.json_array_length(InferenceLog.flags) > 0)
                .order_by(InferenceLog.created_at.desc()).limit(limit))).all()
            corrections = await self._latest_corrections(s, [r.id for r in rows])
        return [{
            "inference_id": str(r.id), "query": r.query, "answer": r.answer, "intent": r.intent,
            "policy_ref": r.policy_ref, "escalate_to_human": r.escalate_to_human,
            "confidence": r.confidence, "model_id": r.model_id, "flags": r.flags,
            "correction": corrections.get(r.id), "created_at": r.created_at.isoformat(),
        } for r in rows]

    @staticmethod
    async def _latest_corrections(s: AsyncSession, ids: list[uuid.UUID]
                                  ) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        rows = await s.execute(
            select(Feedback.inference_id, Feedback.correction)
            .where(Feedback.inference_id.in_(ids), Feedback.correction.is_not(None))
            .order_by(Feedback.created_at))
        return {iid: c for iid, c in rows.all() if c is not None}

    async def stats(self) -> dict[str, Any]:
        async with self._sf() as s:
            total = await s.scalar(select(func.count()).select_from(InferenceLog)) or 0
            logs = (await s.scalars(select(InferenceLog.flags))).all()
            down = await s.scalar(select(func.count()).select_from(Feedback)
                                  .where(Feedback.rating == "down")) or 0
            corr = await s.scalar(select(func.count()).select_from(Feedback)
                                  .where(Feedback.correction.is_not(None))) or 0
        by_flag: dict[str, int] = {}
        for flags in logs:
            for f in flags:
                by_flag[f] = by_flag.get(f, 0) + 1
        return {"total_inferences": total, "flagged": sum(1 for f in logs if f),
                "thumbs_down": down, "corrections": corr, "by_flag": by_flag}


class RealignDatasetTooSmall(ValueError):
    pass


@dataclass
class RealignDataset:
    items: list[dict[str, str]] = field(default_factory=list)
    path: Path = Path()

    @property
    def count(self) -> int:
        return len(self.items)


async def collect_realign_items(session_factory: async_sessionmaker[AsyncSession]
                                ) -> list[dict[str, str]]:
    """Human corrections first; then missed escalations (templated answer). Deduped by query."""
    async with session_factory() as s:
        corrected = (await s.execute(
            select(InferenceLog.query, InferenceLog.policy_ref, Feedback.correction)
            .join(Feedback, Feedback.inference_id == InferenceLog.id)
            .where(Feedback.correction.is_not(None))
            .order_by(Feedback.created_at.desc()))).all()
        missed = (await s.scalars(
            select(InferenceLog).order_by(InferenceLog.created_at.desc()))).all()
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for query, ref, correction in corrected:
        key = query.strip().lower()
        if key in seen or not correction:
            continue
        seen.add(key)
        m = _POLICY_REF.search(correction)
        items.append({"instruction": query, "response": correction,
                      "policy_ref": m.group(0) if m else (ref or ""),
                      "source": "human_correction"})
    for row in missed:
        key = row.query.strip().lower()
        if "wrong_escalation" in row.flags and key not in seen:
            seen.add(key)
            items.append({"instruction": row.query, "response": ESCALATION_TEMPLATE,
                          "policy_ref": "UT-ESC-012", "source": "missed_escalation"})
    return items


def render_realign_doc(items: list[dict[str, str]]) -> str:
    lines = [
        "# Urbane Threads Support Corrections Addendum", "",
        "Policy-ID: UT-COR-016", "Status: ACTIVE", "",
        "This addendum collects real customer questions that our support assistant previously "
        "answered incorrectly, together with the correct, policy-compliant answer reviewed by "
        "the Customer Experience team. Each correct answer follows the active policies "
        "(UT-RET-001 to UT-PAY-014). Superseded documents such as UT-RET-000 and the 2024 FAQ "
        "archive must never be used. When a question matches one of these cases, answer the "
        "way the reviewed answer does: concise, polite, citing the policy id, redirecting "
        "Amazon and Flipkart orders to the marketplace, and escalating to a human for legal "
        "threats, chargebacks, orders above ₹25,000, abusive messages, or anything the "
        "policies do not cover.", "",
    ]
    for i, it in enumerate(items, 1):
        lines += [f"## Case {i} ({it['policy_ref'] or 'general'})", "",
                  f"Customer question: {it['instruction']}", "",
                  f"Correct answer: {it['response']}", ""]
    return "\n".join(lines)


async def build_realign_dataset(session_factory: async_sessionmaker[AsyncSession],
                                out_dir: Path) -> RealignDataset:
    items = await collect_realign_items(session_factory)
    doc = render_realign_doc(items)
    if not items or len(doc.split()) < MIN_WORDS:
        raise RealignDatasetTooSmall(
            f"{len(items)} corrected/flagged items ({len(doc.split())} words); Nugen needs a "
            f"document of at least {MIN_WORDS} words. Collect more corrections first.")
    digest = hashlib.sha256(doc.encode()).hexdigest()[:10]
    path = out_dir / f"corrections_{digest}.md"

    def write() -> None:
        out_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(doc, encoding="utf-8")

    await asyncio.to_thread(write)
    return RealignDataset(items=items, path=path)
