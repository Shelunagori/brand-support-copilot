"""Robust extraction of the support JSON from small-model output."""

import json
import re

from pydantic import ValidationError

from app.support.schema import ModelAnswer

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S | re.I)


# Aligned models sometimes emit `"policy_ref": UT-RET-001,` (bare) or `UT-RET-001"` (half-quoted).
# Only the policy_ref value position is touched, never text inside other strings.
_BARE_POLICY_REF = re.compile(r'("policy_ref"\s*:\s*)"?(UT-[A-Z]{3}-\d{3})"?(?=\s*[,}])')


class ParseError(ValueError):
    pass


def repair_json(text: str) -> str:
    """Deterministic, minimal fixes for known model formatting slips."""
    return _BARE_POLICY_REF.sub(r'\1"\2"', text)


def _balanced_objects(text: str) -> list[str]:
    """All top-level {...} spans, honouring strings and escapes."""
    out: list[str] = []
    depth = 0
    start = -1
    in_str = False
    esc = False
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}" and depth:
            depth -= 1
            if depth == 0:
                out.append(text[start:i + 1])
    return out


def parse_support_json(raw: str) -> ModelAnswer:
    if not raw or not raw.strip():
        raise ParseError("empty output")
    raw = repair_json(raw)
    candidates = [m.group(1) for m in _FENCE.finditer(raw)] + [raw]
    last_err = "no JSON object found"
    for cand in candidates:
        for obj in _balanced_objects(cand):
            try:
                data = json.loads(obj)
            except json.JSONDecodeError as exc:
                last_err = f"invalid JSON: {exc.msg}"
                continue
            if not isinstance(data, dict):
                continue
            try:
                return ModelAnswer.model_validate(data)
            except ValidationError as exc:
                fields = ", ".join(str(e["loc"][0]) for e in exc.errors() if e["loc"])
                last_err = f"schema mismatch ({fields or 'unknown'})"
    raise ParseError(last_err)


class AnswerStreamExtractor:
    """Incrementally pulls the value of the "answer" key out of a streaming JSON object,
    so the UI can render the customer-facing text token by token."""

    _KEY = re.compile(r'"answer"\s*:\s*"')

    def __init__(self) -> None:
        self._buf = ""
        self._pos = -1  # index into _buf where the answer value starts; -1 = not found yet
        self._done = False
        self._esc = False

    def feed(self, chunk: str) -> str:
        if self._done:
            return ""
        scan_from = len(self._buf)
        self._buf += chunk
        if self._pos < 0:
            m = self._KEY.search(self._buf)
            if not m:
                return ""
            self._pos = m.end()
            scan_from = self._pos
        out: list[str] = []
        for ch in self._buf[max(scan_from, self._pos):]:
            if self._esc:
                out.append({"n": "\n", "t": "\t", '"': '"', "\\": "\\", "/": "/"}.get(ch, ch))
                self._esc = False
            elif ch == "\\":
                self._esc = True
            elif ch == '"':
                self._done = True
                break
            else:
                out.append(ch)
        return "".join(out)
