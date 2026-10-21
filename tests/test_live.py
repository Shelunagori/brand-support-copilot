"""Real Nugen API checks (costs a few tokens). Run with: uv run pytest -m live"""

import pytest
from dotenv import dotenv_values

from app.config import ROOT
from app.nugen.client import NugenClient
from app.nugen.schemas import ChatMessage

pytestmark = pytest.mark.live
KEY = dotenv_values(ROOT / ".env").get("NUGEN_API_KEY") or ""


@pytest.fixture
async def client():  # type: ignore[no-untyped-def]
    if not KEY:
        pytest.skip("NUGEN_API_KEY not set in .env")
    async with NugenClient(KEY) as c:
        yield c


async def test_list_alignment_ready_base_models(client: NugenClient) -> None:
    models = await client.list_base_models(alignment_ready=True)
    assert any(m.alignment_ready for m in models)


async def test_chat_and_stream_on_base_model(client: NugenClient) -> None:
    msgs = [ChatMessage(role="user", content="Reply with the single word: ok")]
    res = await client.chat("Qwen/Qwen2.5-0.5B-Instruct", msgs, max_tokens=5)
    assert res.content and res.usage.total_tokens > 0
    events = [e async for e in client.stream_chat("Qwen/Qwen2.5-0.5B-Instruct", msgs,
                                                  max_tokens=5)]
    assert events[-1].kind == "done"
