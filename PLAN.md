# Plan — Brand Support Copilot on Nugen

Sources read end to end: `https://docs.nugen.in/llms-full.txt` (full API reference),
`https://api.nugen.in/openapi-public.json` (authoritative schemas), and every guide in
`nugen-in/nugen-cookbook` (alignment, vision alignment, inference, RAG, agents).
Where the cookbook and the OpenAPI spec disagree, the spec wins (noted below).

## Verified Nugen endpoints (base `https://api.nugen.in`, `Authorization: Bearer <key>`)

| Step | Method + path | Request | Response |
|---|---|---|---|
| Upload docs | `POST /api/v3/documents/create` | multipart: `files[]` (required), `categories[]`, `names[]` | `{"document_ids": [...]}` |
| Doc status | `GET /api/v3/documents/{id}/status` | – | `{status: PROCESSING\|READY\|FAILED, document_id, created_at, completed_at, ...}` |
| Benchmark (own) | `POST /api/v3/benchmarks/upload` | multipart: `file` (JSON array of `{sample_num, instruction, response}`), `document_id` (required), `name`, `description` | `{benchmark_id, benchmark_name, status, samples, n_samples}` |
| Benchmark (generated) | `POST /api/v3/benchmarks/create` | JSON `{document_ids, n_samples (1-100), benchmark_name?}` (cookbook says `num_questions`; spec says `n_samples`) | `{benchmark_id, benchmark_name, status: PROCESSING}` |
| Benchmark status | `GET /api/v3/benchmarks/{id}/status` | – | `{benchmark_id, status, ...}` |
| Start alignment | `POST /api/v3/alignment-projects/create` | JSON `{alignment_name, base_model_id, document_ids, benchmark_id?, workflow_id?, description?}` | `{alignment_id, status: PROCESSING, message?}` |
| Alignment status | `GET /api/v3/alignment-projects/{id}/status` | – | `{alignment_id, status (ResourceStatus), queue_position, early_deployable, evaluation_id, evaluation_status, evaluation_message, ...}` |
| Alignment detail | `GET /api/v3/alignment-projects/{id}` | – | `{..., status, model_id?, evaluation_id?, error?, degraded?}` |
| Aligned models | `GET /api/v3/models/aligned` | query `deployment_status`, `base_model_id`, `limit`, `offset` | `{domain_aligned_models: [{model_id, alignment_id, deployment_status, ...}]}` |
| Base models | `GET /api/v3/models/base?alignment_ready=true` | – | `{models: [{model_id, alignment_ready, inference_ready, ...}]}` |
| Deploy | `POST /api/v3/models/{model_id}/deployment` | query `early?` | `{model_id}` (async, 5-15 min) |
| Deploy status | `GET /api/v3/models/{model_id}/deployment/status` | – | `{model_id, status: UNDEPLOYED\|DEPLOYING\|DEPLOYED\|UNDEPLOYING, error}` — `UNDEPLOYED` + `error` = deploy failed |
| Inference | `POST /api/v3/inference/chat/completions` | OpenAI chat body: `model, messages, max_tokens, temperature, stream, top_p, ...` | non-stream: OpenAI `chat.completion` + `usage` + `confidence_score` (0-100, aligned models only). stream: SSE `data: {chunk}` … `data: [DONE]`; usage on final chunk; `{"object":"confidence"}` events interleaved |
| Nugen eval | `POST /api/v3/evaluations/create` | `{model_id, benchmark_id, baseline_model_id?}` | `{evaluation_id, status}` |

`ResourceStatus` enum: PROCESSING, READY, FAILED, DEPLOYING, EVALUATING, UNDEPLOYED, EVALUATED, STOPPED, QUEUED.
Terminal for alignment: READY / EVALUATED (success), FAILED / STOPPED (failure).

**File formats alignment accepts (developer edition):** text-based files only (`.txt`, `.md`),
≤100 MB each, **each document ≥ 500 words** (whole upload is refused with 400 otherwise;
JSONL training datasets are exempt). PDFs are enterprise-only.

**Limits that shape the design:** 10 alignment projects per org (409 beyond), 10 deployment slots.

## Phases

1. **Nugen client + alignment pipeline** — policy doc pack (15+ docs ≥500 words incl. distractors),
   curated benchmark, typed async httpx client (retries/backoff, timeouts, SSE, usage capture,
   spend log), SQLAlchemy 2 + Alembic state machine (`pipeline_runs` with per-step state), CLI
   `align|status|deploy`. Idempotent: every step checks persisted state before calling Nugen.
2. **Inference API** — FastAPI `/v1/support/query` (strict JSON, repair-once, safe fallback),
   SSE `/v1/support/stream`, Redis cache + rate limit, arq worker for alignment jobs, API-key auth,
   request IDs, JSON logs, `/health` `/ready`. Deterministic escalation guardrail on top of the model.
3. **Eval harness** — 40 questions (edge cases, marketplace, superseded traps, Hinglish); base vs
   aligned; accuracy / violations / escalation / JSON validity / p50-p95 / cost → `reports/`.
4. **Feedback loop** — inference log, `/v1/feedback`, auto-flags, re-alignment dataset builder,
   manual + scheduled re-align trigger.
5. **Infra** — Dockerfile, compose, k8s, Terraform (Azure, plan-only), GitHub Actions, README.
6. **Demo UI** — React + Vite + TS + Tailwind + Framer Motion, five screens, Playwright screenshots.

Working rules: tests first, full suite before/after each phase, one commit per phase,
decisions in `DECISIONS.md`, gaps in `OPEN_QUESTIONS.md`, every paid call in `spend_log`.
