"""Deterministic escalation triggers layered on top of the model.

The model is asked to escalate per policy UT-ESC-012, but a 0.5B model will miss some cases.
These rules can only *raise* escalation, never suppress it.
"""

import re

HIGH_VALUE_THRESHOLD_INR = 25_000

_LEGAL = re.compile(
    r"\b(legal\s+(notice|action)|lawyer|advocate|sue|suing|court|consumer\s+(forum|commission)"
    r"|police\s+complaint|fir\b|legal\s+case|notice\s+bhej)", re.I)
_CHARGEBACK = re.compile(
    r"\b(charge\s*-?\s*back|dispute\s+(the\s+|this\s+)?(charge|transaction|payment)"
    r"|bank\s+dispute|reverse\s+the\s+payment)", re.I)
_ABUSIVE = re.compile(
    r"\b(idiots?|stupid|morons?|fuck\w*|shit\w*|bastards?|scumbags?|chutiy\w*|kamin\w*"
    r"|bewakoof|harami\w*|bloody\s+(fools?|cheats?))\b", re.I)
_AMOUNT = re.compile(
    r"(?:₹|rs\.?|inr|rupees)\s*(\d[\d,]*(?:\.\d+)?)\s*(k|lakh|lac)?"
    r"|(\d[\d,]*(?:\.\d+)?)\s*(k|lakh|lac)?\s*(?:₹|rs\b|inr\b|rupees)", re.I)


def _amounts(text: str) -> list[float]:
    values: list[float] = []
    for m in _AMOUNT.finditer(text):
        num, unit = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        try:
            v = float(num.replace(",", ""))
        except ValueError:
            continue
        unit = (unit or "").lower()
        v *= 1_000 if unit == "k" else 100_000 if unit in {"lakh", "lac"} else 1
        values.append(v)
    return values


def escalation_triggers(query: str) -> list[str]:
    triggers: list[str] = []
    if _LEGAL.search(query):
        triggers.append("legal_threat")
    if _CHARGEBACK.search(query):
        triggers.append("chargeback")
    if any(v > HIGH_VALUE_THRESHOLD_INR for v in _amounts(query)):
        triggers.append("high_value_order")
    if _ABUSIVE.search(query):
        triggers.append("abusive")
    return triggers
