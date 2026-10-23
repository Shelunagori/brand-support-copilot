"""Public-demo status + access-code check (both unauthenticated by design)."""

import secrets
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.deps import Services, client_ip, settings
from app.demo import hit_hourly_limit

router = APIRouter(prefix="/v1/demo", tags=["demo"])


@router.get("/status")
async def status(request: Request, svc: Services) -> dict[str, Any]:
    cfg = settings(request)
    if not cfg.demo_mode:
        return {"demo_mode": False}
    budget = svc.demo_budget
    spent = await budget.spent_today() if budget else 0.0
    reason = await budget.limit_reason() if budget else None
    return {
        "demo_mode": True,
        "access_code_required": True,
        "daily_cap_usd": cfg.demo_daily_cap_usd,
        "spent_today_usd": round(spent, 4),
        "limit_reached": reason is not None,
        "limit_reason": reason,
        "ip_limit_per_hour": cfg.demo_ip_messages_per_hour,
        "base_model_id": svc.support.base_model_id,
    }


class VerifyIn(BaseModel):
    code: str = Field(max_length=200)


@router.post("/verify")
async def verify(body: VerifyIn, request: Request, svc: Services) -> dict[str, bool]:
    cfg = settings(request)
    if not cfg.demo_mode:
        raise HTTPException(404, "not in demo mode")
    if await hit_hourly_limit(svc.redis, "verify", client_ip(request),
                              cfg.demo_verify_attempts_per_hour):
        raise HTTPException(429, "too many attempts")
    expected = cfg.demo_access_code.get_secret_value()
    if not expected or not secrets.compare_digest(body.code, expected):
        raise HTTPException(401, "invalid access code")
    return {"ok": True}
