import json
from pathlib import Path

from sqlalchemy import select

from app.eval.runner import run_eval
from app.eval.scoring import EvalQuestion
from app.models import EvalRun
from app.support.service import SupportService
from tests.test_support_service import ScriptedClient

ANSWER = json.dumps({"intent": "returns", "answer": "Returns are accepted within 7 days.",
                     "policy_ref": "UT-RET-001", "escalate_to_human": False, "confidence": 0.9})


async def test_run_eval_writes_reports_and_persists(tmp_path: Path, session_factory) -> None:  # type: ignore[no-untyped-def]
    questions = [
        EvalQuestion(id="q1", category="returns", question="return window?",
                     expected_facts=["7 days"], expected_escalate=False,
                     expected_policy_ref="UT-RET-001"),
        EvalQuestion(id="q2", category="escalation", question="I will sue you",
                     expected_escalate=True, expected_policy_ref="UT-ESC-012"),
    ]
    svc = SupportService(client=ScriptedClient([ANSWER] * 4), cache=None,  # type: ignore[arg-type]
                         aligned_model_id="model_a", base_model_id="base")
    report = await run_eval(service=svc, questions=questions, kinds=["base", "aligned"],
                            label="test", price_per_mtok=0.2, reports_dir=tmp_path,
                            session_factory=session_factory)
    s = report["summary"]["aligned"]
    assert s["n"] == 2 and s["factual_accuracy"] == 1.0
    # guardrail caught "sue" even though the model did not escalate
    assert s["escalation_accuracy"] == 1.0 and s["model_escalation_accuracy"] == 0.5
    md = (tmp_path / "eval_report.md").read_text()
    assert "| Factual accuracy |" in md and "Δ aligned − base" in md
    assert json.loads((tmp_path / "eval_latest.json").read_text())["label"] == "test"
    async with session_factory() as sess:
        assert (await sess.scalars(select(EvalRun))).one().label == "test"
