import json
import logging

from app.logging_setup import JsonFormatter, redact, request_id_var


def test_redact_masks_bearer_tokens_and_api_keys() -> None:
    assert "sk-123" not in redact("Authorization: Bearer sk-123")
    assert "abc" not in redact('{"x-api-key": "abc"}')
    assert "NUGEN_API_KEY=***" in redact("NUGEN_API_KEY=supersecret")


def test_json_formatter_includes_request_id_and_extras() -> None:
    token = request_id_var.set("req-1")
    try:
        rec = logging.LogRecord("t", logging.INFO, "", 0, "hello Bearer s3cr3t", None, None)
        rec.step = "upload"
        out = json.loads(JsonFormatter().format(rec))
    finally:
        request_id_var.reset(token)
    assert out["request_id"] == "req-1"
    assert out["step"] == "upload"
    assert "s3cr3t" not in out["msg"]
