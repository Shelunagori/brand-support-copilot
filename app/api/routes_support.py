import time

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from app.api.deps import AppServices, ChatAuthed, Services
from app.support.schema import SupportQuery, SupportResponse

router = APIRouter(prefix="/v1/support", tags=["support"])
MODEL_REFRESH_S = 30.0


async def refresh_aligned_model(request: Request, svc: AppServices) -> None:
    """Pick up a newly deployed (re-)aligned model without a restart."""
    from app.api.main import resolve_aligned_model_id

    now = time.monotonic()
    if now - getattr(request.app.state, "model_checked_at", 0.0) < MODEL_REFRESH_S:
        return
    request.app.state.model_checked_at = now
    # may be None after an undeploy: the service then answers with base + "aligned_offline"
    svc.support.aligned_model_id = await resolve_aligned_model_id(svc, request.app.state.settings)


@router.post("/query", response_model=SupportResponse)
async def query(body: SupportQuery, request: Request, _: ChatAuthed, svc: Services
                ) -> SupportResponse:
    await refresh_aligned_model(request, svc)
    return await svc.support.answer(body.query, model_kind=body.model,
                                    request_id=request.state.request_id,
                                    use_cache=body.use_cache)


@router.post("/stream")
async def stream(body: SupportQuery, request: Request, _: ChatAuthed, svc: Services
                 ) -> EventSourceResponse:
    await refresh_aligned_model(request, svc)
    events = svc.support.stream(body.query, model_kind=body.model,
                                request_id=request.state.request_id, use_cache=body.use_cache)
    return EventSourceResponse(events, ping=15)
