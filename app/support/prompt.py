"""Prompt shared by the base and the aligned model, so the comparison measures alignment.

It names the policy ids (so `policy_ref` can be valid) but carries none of the policy rules:
the facts have to come from the model itself.
"""

from app.nugen.schemas import ChatMessage
from app.support.schema import INTENTS

POLICY_CATALOG = {
    "UT-RET-001": "returns",
    "UT-EXC-002": "exchanges",
    "UT-NRT-003": "non-returnable items",
    "UT-REF-004": "refunds",
    "UT-SHP-005": "shipping charges and COD",
    "UT-DLV-006": "delivery timelines",
    "UT-WAR-007": "watch and sunglasses warranty",
    "UT-MKT-008": "Amazon/Flipkart marketplace orders",
    "UT-DMG-009": "damaged or wrong item",
    "UT-GST-010": "GST and invoices",
    "UT-CAN-011": "cancellation",
    "UT-ESC-012": "escalation to a human",
    "UT-ORD-013": "order tracking and address changes",
    "UT-PAY-014": "payments and store credit",
}

SYSTEM_PROMPT = f"""You are the customer support assistant for Urbane Threads, an Indian apparel \
and accessories brand that sells on urbanethreads.in, Amazon and Flipkart.
Answer only from current Urbane Threads policy. Never promise anything outside policy.
Reply with ONLY one JSON object and no other text, in exactly this shape:
{{"intent": "<one of: {', '.join(INTENTS)}>", "answer": "<1-3 short sentences to the customer>", \
"policy_ref": "<policy id or null>", "escalate_to_human": <true or false>, \
"confidence": <number from 0 to 1>}}
Set escalate_to_human to true for legal threats, chargebacks, orders above ₹25,000, abusive \
messages, or anything the policies do not cover.
Policy ids: {'; '.join(f'{k} {v}' for k, v in POLICY_CATALOG.items())}."""

FEW_SHOT_Q = "Where can I see where my parcel is?"
FEW_SHOT_A = ('{"intent": "order_status", "answer": "You can track your parcel from My Orders on '
              'urbanethreads.in or with the tracking link in your dispatch email.", '
              '"policy_ref": "UT-ORD-013", "escalate_to_human": false, "confidence": 0.9}')

REPAIR_INSTRUCTION = ("Your previous reply was not valid JSON ({error}). Reply again with ONLY "
                      "the JSON object in the required shape, nothing else.")


def build_messages(query: str) -> list[ChatMessage]:
    return [
        ChatMessage(role="system", content=SYSTEM_PROMPT),
        ChatMessage(role="user", content=FEW_SHOT_Q),
        ChatMessage(role="assistant", content=FEW_SHOT_A),
        ChatMessage(role="user", content=query),
    ]


def build_repair_messages(query: str, bad_output: str, error: str) -> list[ChatMessage]:
    return [
        *build_messages(query),
        ChatMessage(role="assistant", content=bad_output[:1500] or "(empty)"),
        ChatMessage(role="user", content=REPAIR_INSTRUCTION.format(error=error)),
    ]
