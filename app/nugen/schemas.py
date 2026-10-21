"""Typed views of the Nugen v3 API (fields from https://api.nugen.in/openapi-public.json).

Models ignore unknown fields so additive API changes never break the client.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class _Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


class DocumentStatus(_Model):
    status: str
    document_id: str | None = None
    created_at: str | None = None
    completed_at: str | None = None


class BenchmarkUpload(_Model):
    benchmark_id: str
    benchmark_name: str | None = None
    status: str
    n_samples: int | None = None


class BenchmarkStatus(_Model):
    benchmark_id: str
    status: str


class AlignmentStatus(_Model):
    alignment_id: str
    status: str
    message: str | None = None
    queue_position: int | None = None
    early_deployable: bool | None = None
    evaluation_id: str | None = None
    evaluation_status: str | None = None
    evaluation_message: str | None = None
    created_at: str | None = None
    completed_at: str | None = None


class AlignmentDetail(_Model):
    alignment_id: str
    status: str
    alignment_name: str | None = None
    base_model_id: str | None = None
    model_id: str | None = None
    evaluation_id: str | None = None
    error: str | None = None
    degraded: bool | None = None
    performance_metrics: dict[str, Any] | None = None


class AlignedModel(_Model):
    model_id: str
    model_name: str | None = None
    base_model_id: str | None = None
    alignment_id: str | None = None
    deployment_status: str | None = None
    created_at: str | None = None


class BaseModelInfo(_Model):
    model_id: str
    model_name: str | None = None
    parameters: str | None = None
    alignment_ready: bool | None = None
    inference_ready: bool | None = None
    available_on_request: bool | None = None
    type: str | None = None


class DeploymentStatus(_Model):
    model_id: str
    status: str
    error: str | None = None

    @property
    def failed(self) -> bool:
        return self.status == "UNDEPLOYED" and bool(self.error)


class ChatMessage(_Model):
    role: Literal["system", "user", "assistant"]
    content: str


class Usage(_Model):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatResult(_Model):
    content: str
    model: str
    usage: Usage
    confidence_score: float | None = None
    finish_reason: str | None = None
    latency_ms: float


class StreamEvent(_Model):
    kind: Literal["delta", "confidence", "done"]
    delta: str = ""
    confidence: float | None = None
    usage: Usage | None = None
    finish_reason: str | None = None
    latency_ms: float | None = None
