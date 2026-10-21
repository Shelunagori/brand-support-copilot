# Brand Support Copilot

A production-shaped customer-support backend for **Urbane Threads**, a fictional India-only D2C
apparel brand (own site + Amazon + Flipkart). It uses a **Nugen domain-aligned model** that has
learned the brand's policies (returns, refunds, shipping, GST, warranty, marketplace rules,
escalation), and wraps it in a strict-JSON API with guardrails, caching, rate limiting, an eval
harness and a feedback → re-alignment loop.

> Built for the Nugen Intelligence Senior Backend Engineer exercise.
> Stack: Python 3.12 · FastAPI · SQLAlchemy 2 + Alembic · PostgreSQL · Redis · arq · httpx ·
> Docker · Kubernetes · Terraform (Azure) · GitHub Actions · React/Vite UI.

## Status (2026-10-21)

| Area | State |
|---|---|
| Nugen client, resumable alignment pipeline, CLI | ✅ built · unit-tested against an HTTP mock |
| Support API (strict JSON, repair/fallback, SSE, cache, rate limit, auth, logs) | ✅ built · tested |
| Eval harness (base vs aligned, 40 held-out questions) | ✅ built · tested |
| Feedback loop + re-alignment (manual + nightly) | ✅ built · tested |
| Docker / compose / k8s / Terraform / CI | ✅ images build · kubeconform 8/8 · `terraform validate` clean |
| Demo UI (5 screens, dark + light) | ✅ build + lint + WCAG contrast + 18 Playwright tests |
| **Live Nugen run (align → deploy → eval → re-align)** | ⏳ **blocked by a Nugen API outage** |

**Test suite:** 70 passing (`pytest`, against real Postgres + Redis) · ruff · mypy `--strict` clean ·
3 Alembic migrations, `alembic check` clean.

**Outage:** `api.nugen.in` worked at ~18:20 IST (OpenAPI spec fetched). From **18:44 IST on
2026-10-21** every request, `/health` included, has returned **HTTP 522** (Cloudflare can't reach
the origin). The user confirmed this independently at 19:05 IST, `cf-ray a4e0a435dc76052e-DEL`.
`docs.nugen.in` and `platform.nugen.in` load, but the platform can't call the API (CORS / 522).
`status.nugen.in` still showed "operational". No paid call has been made, so **spend so far is
$0.00**.

**Live run cost estimate** (`make estimate`, written to the spend log): 2 alignments × $10
(conservative placeholder: the API does not report alignment cost) + ~146k inference tokens
(~$0.03) = **$20.03, within the $40 cap**. The spend guard charges every alignment at that
estimate and refuses any call that would cross the cap.

### Reproduce the live run (one command)

```bash
cp .env.example .env          # add NUGEN_API_KEY
make align-and-eval
```

That runs, in order (every paid step goes through the spend guard):

```bash
docker compose up -d --wait postgres redis && uv run alembic upgrade head
uv run python -m app.cli wait-api            # blocks until api.nugen.in/health == 200
uv run python -m app.cli estimate            # logs estimate; exits 2 if it would cross the cap
uv run python -m app.cli smoke               # 1 tiny paid inference
uv run python -m app.cli align --yes         # upload docs + benchmark, align, poll to READY
uv run python -m app.cli deploy              # deploy, poll to DEPLOYED
uv run python -m app.eval run --models base,aligned --label "initial alignment"
uv run python -m app.feedback_seed           # real inferences + reviewer corrections
uv run python -m app.cli realign --yes --deploy
uv run python -m app.eval run --models base,aligned --label "after re-alignment"
uv run python -m app.cli spend
```

Each step is idempotent: re-running `make align-and-eval` after a failure resumes from the last
completed Nugen step.

## The problem

Support agents (human or AI) for a multi-channel D2C brand get the details wrong in the costly
places: a 30-day return window that was cut to 7, a refund promised on an Amazon order the brand
can't refund, a chargeback threat that should have gone to a human. A general LLM doesn't know
the brand's rules; prompt-stuffing all policies is slow and brittle; and you need to *measure*
whether the model follows policy and improve it from production feedback.

## Architecture

```mermaid
flowchart LR
  subgraph Client
    UI[React demo UI]
    API_C[API clients<br/>X-API-Key]
  end
  subgraph Backend
    A[FastAPI<br/>/v1/support/query · /stream]
    G[Guardrails<br/>legal · chargeback · >₹25k · abuse]
    P[JSON parse<br/>repair once → fallback]
    R[(Redis<br/>cache · rate limit · arq queue)]
    DB[(Postgres<br/>runs · events · spend · inferences · feedback · evals)]
    W[arq worker<br/>align · deploy · nightly re-align]
    E[Eval harness<br/>base vs aligned]
  end
  subgraph Nugen
    N1[documents/create]
    N2[benchmarks/upload]
    N3[alignment-projects/create<br/>+ /status]
    N4[models/:id/deployment]
    N5[inference/chat/completions]
  end
  UI --> A
  API_C --> A
  A --> R
  A --> P --> G
  A --> N5
  A --> DB
  W --> N1 --> N2 --> N3 --> N4
  W --> DB
  E --> A
  DB -- flagged + corrections --> W
```

## How Nugen alignment is used

Every endpoint below was verified against `https://api.nugen.in/openapi-public.json` and the
`nugen-cookbook` (see [PLAN.md](PLAN.md) for request/response shapes).

1. **Docs** — 15 active policy docs + 3 distractors (a SUPERSEDED 2024 returns policy, an
   archived FAQ with conflicting rules, a marketing page) in [data/docs](data/docs). Each is
   Markdown and ≥500 words (Nugen rejects shorter docs; the pipeline checks before uploading).
2. **Upload** — `POST /api/v3/documents/create` (multipart), poll `GET /documents/{id}/status`.
3. **Benchmark** — a curated 30-sample Q&A set ([data/benchmark](data/benchmark)) via
   `POST /api/v3/benchmarks/upload`, so Nugen's built-in evaluation has policy-correct ground
   truth. It is separate from the 40-question held-out eval.
4. **Align** — `POST /api/v3/alignment-projects/create` on `Qwen/Qwen2.5-0.5B-Instruct`, then
   poll `GET /alignment-projects/{id}/status` until READY.
5. **Deploy** — `POST /api/v3/models/{model_id}/deployment`, poll `/deployment/status` until
   DEPLOYED (`UNDEPLOYED` + `error` = failed).
6. **Infer** — `POST /api/v3/inference/chat/completions` with the aligned `model_id`; the API
   maps Nugen's `confidence_score` (inference-time uncertainty, aligned models only) to
   `confidence`.

The pipeline is **idempotent and resumable**: every Nugen id is committed to Postgres when it is
created, the run is keyed by a hash of (docs + benchmark + base model), and transient failures
leave the run resumable instead of re-uploading or re-paying.

```bash
python -m app.cli models          # alignment-ready base models (free)
python -m app.cli align           # upload docs + benchmark (free), stops before paid step
python -m app.cli align --yes     # start alignment and wait for READY
python -m app.cli deploy          # deploy + wait for DEPLOYED
python -m app.cli status          # step timeline (add --refresh for live Nugen status)
python -m app.cli spend           # spend log summary
python -m app.eval run --label initial
python -m app.cli realign --yes   # re-align from feedback corrections
```

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/support/query` | `{query, model: aligned\|base}` → `{intent, answer, policy_ref, escalate_to_human, confidence, model_id, latency_ms, …}` |
| POST | `/v1/support/stream` | SSE: `meta`, `token`, `answer_delta`, `confidence`, `final` |
| POST | `/v1/feedback` | thumbs up/down + correction |
| GET | `/v1/feedback/flagged`, `/v1/feedback/stats` | auto- and human-flagged answers |
| GET/POST | `/v1/realign/dataset`, `/v1/realign` | build the corrections dataset, queue re-alignment |
| GET/POST | `/v1/pipeline/runs`, `/v1/pipeline/align`, `/v1/pipeline/deploy` | timeline + arq jobs |
| GET | `/v1/eval/latest`, `/v1/eval/history` | eval reports |
| GET | `/v1/spend`, `/v1/models`, `/health`, `/ready` | ops |

Auth: `X-API-Key` (or `Authorization: Bearer`). Every response has an `X-Request-ID`; logs are
JSON lines with the request id, and secrets are redacted by the formatter.

**Answer pipeline:** Redis cache (normalised query + model id) → model → strict Pydantic parse
(fenced / chatty output tolerated) → **one repair retry** → **safe fallback** that escalates →
deterministic guardrails that can only *raise* escalation. Upstream errors also fall back to a
human hand-off, flagged in the log.

## Quickstart

```bash
cp .env.example .env            # put NUGEN_API_KEY in .env (never committed)
docker compose --profile app up --build
# API  http://localhost:8000/docs   ·   UI  http://localhost:8080
```

Local dev:

```bash
docker compose up -d postgres redis
uv sync && uv run alembic upgrade head
uv run uvicorn --factory app.api.main:create_app --reload
uv run arq app.worker.WorkerSettings
uv run pytest -q                # needs the postgres/redis containers
```

## Eval results

**Pending live run.** These cells stay empty until the Nugen API is reachable, and no numbers
here are simulated. `make align-and-eval` fills in
[reports/eval_report.md](reports/eval_report.md).

| Metric | Base `Qwen2.5-0.5B-Instruct` | Aligned | Aligned after re-align |
|---|---|---|---|
| Factual accuracy | pending live run | pending live run | pending live run |
| Policy violations | pending live run | pending live run | pending live run |
| Escalation correctness (with guardrails / model only) | pending live run | pending live run | pending live run |
| JSON valid (first try / after repair) | pending live run | pending live run | pending live run |
| Correct `policy_ref` | pending live run | pending live run | pending live run |
| Latency p50 / p95 | pending live run | pending live run | pending live run |
| Tokens / est. cost | pending live run | pending live run | pending live run |

The 40 questions ([data/eval/questions.jsonl](data/eval/questions.jsonl)) cover in-window and
out-of-window returns, non-returnables, refunds, shipping/COD thresholds, delivery zones,
warranty exclusions, marketplace redirects, damage claims, GST edges, cancellation, 6
escalations, 5 superseded-policy traps, 6 Hinglish queries and 1 out-of-scope request. The
feedback seed set ([data/feedback/seed.jsonl](data/feedback/seed.jsonl)) is disjoint from it,
so the re-aligned model is never trained on eval questions.

## Screenshots

The UI was captured with the backend up but before any live Nugen data existed, so these show
the designed empty, error and offline states. They will be re-captured with real data after the
live run (`make screenshots`).

| | Dark | Light |
|---|---|---|
| Support chat | ![](ui/screenshots/chat-dark.png) | ![](ui/screenshots/chat-light.png) |
| Base vs aligned | ![](ui/screenshots/compare-dark.png) | ![](ui/screenshots/compare-light.png) |
| Alignment pipeline | ![](ui/screenshots/pipeline-dark.png) | ![](ui/screenshots/pipeline-light.png) |
| Eval dashboard | ![](ui/screenshots/eval-dark.png) | ![](ui/screenshots/eval-light.png) |
| Feedback loop | ![](ui/screenshots/feedback-dark.png) | ![](ui/screenshots/feedback-light.png) |
| Mobile chat | ![](ui/screenshots/chat-mobile-dark.png) | ![](ui/screenshots/chat-mobile-light.png) |

## Spend log

Every paid call (inference, alignment) is written to the `spend_log` table with endpoint,
tokens and estimated cost. A hard stop refuses any paid call that would push estimated spend
past `NUGEN_SPEND_HARD_LIMIT_USD` ($40). Nugen does not publish prices in its API docs, so
inference is estimated with `NUGEN_PRICE_PER_MTOK_USD` and each alignment is charged
`NUGEN_ALIGNMENT_COST_EST_USD` ($10, conservative). See [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

| Item | Calls | Tokens | Est. cost |
|---|---|---|---|
| Actual spend so far | 0 | 0 | **$0.00** |
| Estimate for the full live run (logged) | 2 alignments + ~150 inferences | ~146k | $20.03 |

## RAG vs Domain Alignment

My earlier project, [ecommerce-ai-ops-agent](https://github.com/Shelunagori/ecommerce-ai-ops-agent),
tackles the same e-commerce support-policy problem with **RAG**: pgvector retrieval, a LangGraph
agent and human-approved actions. This project takes the other route: it teaches the policies to
the model through **Nugen domain alignment** and calls it with no retrieval step.
Both repos use **synthetic data** (invented brands, customers and policies). The alignment
numbers here are **pending live run**, so neither approach is claimed to beat the other yet.

| Dimension | RAG (ecommerce-ai-ops-agent) | Domain alignment (this repo) |
|---|---|---|
| Knowledge updates | Re-index the changed docs (minutes) | Re-align the model (a training run) |
| Citations / grounding | Native: answer cites the retrieved chunk | `policy_ref` produced by the model, validated against the policy catalog and scored in the eval |
| Behaviour consistency + structured output | Depends on prompt + retrieved context | Stronger: tone, escalation rules and JSON shape are trained in |
| Latency / infra | Embedding + vector search hop; needs a vector DB | No retrieval hop, no vector DB |
| Uncovered topics (hallucination risk) | Needs an escalation path | Needs an escalation path (guardrails + `UT-ESC-012`) |

**Next step:** a hybrid. Use the aligned model for stable policy and behaviour, and add retrieval
only for policies that change often (sale terms, promos). Then compare all three on the same
held-out eval.

## Trade-offs

- **0.5B base model** — cheap and fast, so alignment gains are easy to see, but strict JSON is
  hard for it. That is why the repair and fallback path and the guardrails exist.
- **No RAG at answer time** — on purpose, so the eval measures what alignment taught the model.
  In production I'd add retrieval of the cited policy as a second line of defence.
- **Guardrails can only escalate** — false positives send a few extra tickets to humans, which
  costs much less than a missed legal threat.
- **Upstream failure → HTTP 200 with a fallback hand-off** — good for the customer; outages
  show up in logs and flags rather than 5xx rates, so alert on the `fallback` rate.
- **Fixed-window rate limit** — simple and atomic in Redis; a sliding window or token bucket
  would smooth bursts at the window edge.

## Next steps

- Add the cited policy's text to the prompt (retrieval) and run the eval with and without it.
- Use Nugen `POST /evaluations/create` in CI to gate a re-aligned model before promotion.
- Canary routing between old and re-aligned models, with automatic rollback on eval regression.
- OpenTelemetry traces across API → Nugen; a Prometheus metric for the fallback rate.

## Repo map

```
app/nugen/      typed async Nugen client (retries, SSE, usage, spend guard)
app/pipeline.py resumable alignment state machine     app/cli.py   operator CLI
app/support/    prompt, parser, guardrails, cache, service
app/api/        FastAPI app, auth, rate limit, routes  app/worker.py arq jobs + cron
app/eval/       scoring + runner + report              app/feedback.py feedback loop
data/           policy docs, benchmark, eval set       infra/        k8s + Terraform
ui/             React demo UI                          reports/      eval reports
```

Decisions are logged in [DECISIONS.md](DECISIONS.md) (all VETOABLE), open questions in
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).
