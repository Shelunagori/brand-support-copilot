from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from app.api.deps import Authed, Services
from app.support.schema import SupportQuery, SupportResponse

router = APIRouter(prefix="/v1/support", tags=["support"])


@router.post("/query", response_model=SupportResponse)
async def query(body: SupportQuery, request: Request, _: Authed, svc: Services
                ) -> SupportResponse:
    return await svc.support.answer(body.query, model_kind=body.model,
                                    request_id=request.state.request_id,
                                    use_cache=body.use_cache)


@router.post("/stream")
async def stream(body: SupportQuery, request: Request, _: Authed, svc: Services
                 ) -> EventSourceResponse:
    events = svc.support.stream(body.query, model_kind=body.model,
                                request_id=request.state.request_id, use_cache=body.use_cache)
    return EventSourceResponse(events, ping=15)
