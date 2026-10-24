/**
 * /review case study: every fact on the page lives here, sourced from the repo (README,
 * DECISIONS.md, OPEN_QUESTIONS.md, reports/, Postgres run events) and the Nugen billing page.
 * The page component only lays this out; it must not add numbers or claims.
 * Eval tables are rendered from the bundled snapshot (/v1/eval/history), not from this file.
 */

export const LINKS = {
  compare: '/compare',
  eval: '/eval',
  github: 'https://github.com/Shelunagori/brand-support-copilot',
  ragProject: 'https://github.com/Shelunagori/ecommerce-ai-ops-agent',
  ragReview: 'https://ecommerce-ai-ops-agent.vercel.app/review',
};

export const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'pipeline', label: 'Alignment pipeline' },
  { id: 'inference', label: 'Inference flow' },
  { id: 'results', label: 'Experiments & results' },
  { id: 'feedback', label: 'Feedback loop' },
  { id: 'rag-vs-alignment', label: 'RAG vs alignment' },
  { id: 'safety', label: 'Safety & cost controls' },
  { id: 'cost', label: 'Cost' },
  { id: 'testing', label: 'Testing & CI' },
  { id: 'deployment', label: 'Deployment' },
  { id: 'decisions', label: 'Decisions & open questions' },
  { id: 'nugen-notes', label: 'Platform notes' },
] as const;

export const HERO = {
  eyebrow: 'Engineering case study',
  title: 'Brand Support Copilot',
  subtitle: 'A policy-aware support backend for a fictional D2C brand, built on Nugen domain alignment.',
  summary:
    'Urbane Threads is an invented India-only apparel brand (own site, Amazon, Flipkart) with 15 written support policies. ' +
    'This project aligns small open models to those policies with the Nugen API, serves them behind a strict-JSON FastAPI ' +
    'service with guardrails and a feedback loop, and measures them against their unaligned base models on 40 held-out questions. ' +
    'All data is synthetic. Results are reported as measured, including the regressions.',
  badges: ['Synthetic data', 'Live Nugen runs', 'Results as measured'],
};

export const OVERVIEW_CARDS = [
  {
    title: 'Domain alignment, end to end',
    body: 'Upload docs, benchmark, align, poll, deploy: a resumable pipeline with every Nugen id persisted in Postgres.',
  },
  {
    title: 'Strict JSON support answers',
    body: 'Every reply is validated into {intent, answer, policy_ref, escalate_to_human, confidence}; invalid output gets one repair, then a safe escalation.',
  },
  {
    title: 'Measured, not assumed',
    body: '3 live experiments (2 base models), each evaluated against its own base model on the same 40 held-out questions.',
  },
  {
    title: 'A public demo with hard limits',
    body: 'Read-only results for everyone; live Compare/Chat behind an access code, with daily, lifetime and per-IP caps.',
  },
];

export type Layer = 'client' | 'deterministic' | 'model' | 'data';
export const ARCHITECTURE: { name: string; detail: string; layer: Layer }[] = [
  { name: 'Vercel · React UI', detail: 'Compare, Chat, Pipeline, Eval, Feedback, Review. No API key in the bundle; bundled snapshot of read-only data.', layer: 'client' },
  { name: 'Render · FastAPI (Docker)', detail: 'Auth tiers, rate limits, demo budget, strict JSON parsing + repair, guardrails, fallback. Migrates on boot.', layer: 'deterministic' },
  { name: 'Nugen API · inference', detail: 'Base model (Llama-3.2-3B) and the deployed aligned model answer with JSON; aligned answers carry Nugen\'s confidence_score.', layer: 'model' },
  { name: 'Nugen API · align / deploy', detail: 'Documents, benchmarks, alignment projects, deployments. Driven by the pipeline CLI, never from the public demo.', layer: 'model' },
  { name: 'Neon · Postgres', detail: 'Pipeline runs + step events, eval runs, inference logs, feedback, spend log. Read-only in the public demo.', layer: 'data' },
  { name: 'Upstash · Redis', detail: 'Response cache, rate-limit counters, demo spend budget, aligned-model kill switch.', layer: 'data' },
];
export const LAYER_LEGEND: Record<Layer, string> = {
  client: 'Client',
  deterministic: 'Deterministic code',
  model: 'Model / Nugen',
  data: 'State',
};
export const ARCHITECTURE_NOTE =
  'The model only writes the answer JSON. Escalation guardrails, schema validation, JSON repair, caps, auth and the fallback are plain code.';

export const PIPELINE_STEPS = [
  { step: 'Upload', detail: 'POST /api/v3/documents/create, one file per request; each doc must be at least 500 words (checked locally first).' },
  { step: 'Benchmark', detail: 'POST /api/v3/benchmarks/upload with 30 curated Q&A pairs, held out from the 40-question eval.' },
  { step: 'Align', detail: 'POST /api/v3/alignment-projects/create; paid, so the CLI requires --yes and the spend guard checks the budget first.' },
  { step: 'Poll', detail: 'GET /alignment-projects/{id}/status until READY (QUEUED → PROCESSING → READY observed).' },
  { step: 'Deploy', detail: 'POST /models/{id}/deployment, then poll /deployment/status until DEPLOYED.' },
];
export const PIPELINE_PROPERTIES = [
  'Resumable: each Nugen id is committed to Postgres as soon as it exists; a crash resumes from the last finished step.',
  'Idempotent: a run is keyed by sha256(docs + benchmark + base model); same inputs never re-upload or re-pay.',
  'Every step is an append-only event, which drives the CLI status view and the Pipeline timeline in the UI.',
];
export const PIPELINE_RUNS = [
  { run: 'Exp 1 · Qwen2.5-0.5B, all 18 docs', upload: '0.8 s', docsReady: '21.9 s', benchmark: '0.5 s', align: '344 s', deploy: '20.7 s', model: 'model_01m5hvz1m0n0bn6r' },
  { run: 'Exp 1 re-align · + corrections doc (19 docs)', upload: '1.9 s', docsReady: '1.2 s', benchmark: '0.3 s', align: '334 s', deploy: '15.4 s', model: 'model_01m5hwkzsc790kf4' },
  { run: 'Exp 3 · Llama-3.2-3B, 15 ACTIVE docs', upload: '1.7 s', docsReady: '1.3 s', benchmark: '0.3 s', align: '344 s', deploy: '20.6 s', model: 'model_01m5hz9nr9gr5wqv' },
];
export const PIPELINE_409 = {
  title: 'Duplicate documents return HTTP 409',
  body:
    'The first re-align failed at step one: Nugen deduplicates documents by content and answers 409 with the existing ' +
    'document_id nested under "detail", which rejected the whole batch. The client now uploads one file per request and ' +
    'reuses the returned id on 409. Nothing was charged; the fix shipped with a test built from the real response shape.',
};

export const INFERENCE_STEPS = [
  { step: 'Query', detail: 'Same system prompt for base and aligned: output contract + policy-id catalog, no policy text (no retrieval).', kind: 'deterministic' as Layer },
  { step: 'Model', detail: 'Nugen chat completions (SSE streaming in the UI); the answer text streams out of the partial JSON.', kind: 'model' as Layer },
  { step: 'Strict schema', detail: 'Pydantic validates intent, answer, policy_ref (UT-XXX-NNN), escalate_to_human, confidence.', kind: 'deterministic' as Layer },
  { step: 'Field-scoped repair', detail: 'Quotes a bare or half-quoted policy id in the policy_ref value only, e.g. UT-RET-001 → "UT-RET-001".', kind: 'deterministic' as Layer },
  { step: 'One retry', detail: 'Still invalid: the model is asked once more to return only the JSON object.', kind: 'model' as Layer },
  { step: 'Safe fallback', detail: 'Still invalid or upstream error: a polite hand-off answer with escalate_to_human = true.', kind: 'deterministic' as Layer },
];
export const GUARDRAILS = [
  'Legal threats (legal notice, consumer court, lawyer)',
  'Chargebacks / payment disputes',
  'Order amounts above ₹25,000 (₹, Rs, INR, "k" and "lakh" parsed)',
  'Abusive language (English and Hinglish)',
];
export const GUARDRAIL_NOTE =
  'Guardrails can only raise escalation, never lower it. Confidence is labelled by source: Nugen\'s confidence_score for aligned models, "model-reported · uncalibrated" for base models (the base model wrote 0.8 in 28 of 40 eval answers).';

export const SIGNIFICANCE = '40 questions: ±2.5 pp is exactly one question. Differences of 1–2 questions are not significant.';

export const FINDINGS = [
  { title: 'JSON repair changes the 3B verdict', body: 'Aligned Llama-3.2-3B lost 17 of 40 answers to one slip: an unquoted policy_ref. Re-scored offline with the repair, it scores 37.5% factual accuracy vs 30.0% for its base, and 92.5% vs 72.5% on escalation. That is 3 questions, not significant at n = 40.' },
  { title: 'A 0.5B model did not absorb the policy numbers', body: 'Across two alignments it learned the brand\'s vocabulary but invented windows and fees, and its policy_ref was null in the raw output (32.5% → 2.5%).' },
  { title: 'Superseded-policy traps were never answered correctly', body: '0 of 5 in every run, base and aligned, with or without the distractor docs. That points to retrieval or explicit "replaced by" training pairs.' },
  { title: 'The deterministic safety net held', body: 'Escalation correctness stayed at 87.5–92.5% whenever the JSON parsed, and no invalid JSON ever reached a customer.' },
  { title: 'Alignment did not beat its base model as run', body: 'In all three live experiments, the aligned model as run did not beat its base model on factual accuracy.' },
];

export const FEEDBACK_STEPS = [
  { step: 'Log', detail: 'Every inference is stored with auto-flags: fallback, invalid_json, low_confidence, wrong_escalation.' },
  { step: 'Review', detail: 'Thumbs-down + a written correction (POST /v1/feedback).' },
  { step: 'Dataset', detail: 'Corrections + templated answers for missed escalations become a Markdown "Corrections Addendum" (must be ≥ 500 words).' },
  { step: 'Re-align', detail: 'A new alignment run on the policy docs + the addendum, then deploy. Manual endpoint or a nightly job (prepare-only unless explicitly allowed to spend).' },
];
export const FEEDBACK_REAL = [
  { value: '24', label: 'real reviewer-seed inferences on the aligned 0.5B model' },
  { value: '19', label: 'thumbs-down with corrections' },
  { value: '20', label: 'items in the re-alignment dataset' },
  { value: '0', label: 'eval questions in the training data (seed set is disjoint)' },
];

export const RAG_TABLE = [
  { dimension: 'Knowledge updates', rag: 'Re-index the changed docs (minutes)', alignment: 'Re-align the model (a training run, ~5.5 min here)' },
  { dimension: 'Citations / grounding', rag: 'Native: the answer cites the retrieved chunk', alignment: 'policy_ref produced by the model, validated against the catalog and scored' },
  { dimension: 'Behaviour + structured output', rag: 'Depends on prompt + retrieved context', alignment: 'Intended strength; measured here 57.5–95% JSON validity before repair, 100% after the field-scoped repair (Exp 3 re-score)' },
  { dimension: 'Latency / infra', rag: 'Embedding + vector search hop; needs a vector DB', alignment: 'No retrieval hop, no vector DB' },
  { dimension: 'Uncovered topics', rag: 'Needs an escalation path', alignment: 'Needs an escalation path (guardrails + UT-ESC-012)' },
];
export const RAG_NOTE =
  'Both projects use synthetic data and were not scored on a shared eval, so this is a trade-off table, not a head-to-head result. Next step: a hybrid (aligned model for stable behaviour, retrieval for fast-changing policies) on the same 40 questions.';

export const SAFETY = [
  { title: 'Demo mode', body: 'Read-only screens are public; Postgres is never written by the demo; no job queue.' },
  { title: 'Access code, checked server-side', body: 'Chat and Compare send X-Demo-Code; constant-time comparison; fails closed (503) if no code is configured; verify attempts limited to 20 per IP per hour.' },
  { title: '403 on paid and admin actions', body: 'Align, deploy, re-align and feedback writes return "disabled in demo", even with a valid API key.' },
  { title: 'Spend caps', body: '$0.25/day and $1.25 lifetime in rate-card dollars (billing has run up to ~4–5× the rate card), plus 10 messages per IP per hour.' },
  { title: 'Auto-undeploy at the lifetime cap', body: 'The API undeploys the aligned model once and sets a Redis kill switch, so every replica answers with the base model.' },
  { title: 'No key in the browser', body: 'NUGEN_API_KEY lives only in Render\'s environment; production builds fail if an API key is present; CORS allows only the Vercel domain.' },
];
export const INCIDENT = {
  title: 'Incident: the public dev key worked on the first deploy',
  body:
    'The Render service was created by hand, so render.yaml\'s env vars (DEMO_MODE, a random CLIENT_API_KEYS) were not applied and the API ran ' +
    'in normal mode with the dev default key that is published in the repo. The first smoke test against the live URLs caught it, and the fix was live about two minutes later. Fix, test first: ' +
    'on a hosted platform the dev key is never accepted, and the API warns when demo mode is off. Render auto-deployed it and the key ' +
    'returned 401; the env vars were then set.',
};

export const BILLING_ROWS = [
  { item: 'Alignment · Qwen2.5-0.5B (initial)', inr: '₹708.50', note: 'billing line "urbane-threads-support-d65e4739 (training)"' },
  { item: 'Alignment · Qwen2.5-0.5B (re-align)', inr: '₹756.68', note: 'billing line "urbane-threads-support-03e55195 (training)"' },
  { item: 'Inference · Qwen2.5-0.5B base', inr: '₹54.10', note: '22 Oct usage line' },
  { item: 'Inference · aligned 0.5B (model_01m5hvz1m0n0bn6r)', inr: '₹75.38', note: '22 Oct usage line' },
  { item: 'Exp 3 (3B alignment + eval + Nugen auto-eval) + first demo chats', inr: '₹386.54', note: 'used ₹1,638.98 on 22 Oct → ₹2,025.52 on 23 Oct (21:23)' },
  { item: 'Live Compare smoke test (base + aligned)', inr: '₹0.73', note: '₹0.24 base + ₹0.49 aligned, 23 Oct' },
];
export const BILLING_TOTAL = {
  used: '₹2,027.91 (≈ $21.06 at ₹96.28 = $1)',
  balance: '₹2,786.02 of ₹4,813.93',
  asOf: '24 Oct 2026',
};
export const RATE_CARD = {
  source: 'Nugen Org Settings → Usage-Based Pricing (INR per 1M words, billed in USD); converted at 0.75 words per token.',
  rows: [
    { tier: 'nano (≤1B)', general: '₹944 · $7.35', aligned: '₹1,888 · $14.71', alignment: '₹9,439 · $73.53' },
    { tier: 'small (1–10B)', general: '₹472 · $3.68', aligned: '₹944 · $7.35', alignment: '₹4,720 · $36.77' },
  ],
  unit: '₹ per 1M words · $ per 1M tokens',
  caveat:
    'Billing ran up to ~4–5× the rate card on evals (open question), so caps are set conservatively. Alignment is billed on words Nugen processes internally, so it is estimated per run ($8) from real billing.',
};
export const IDLE_HOSTING = {
  value: '₹0',
  label: 'charged for keeping the aligned model deployed while idle: deployed since 21:17 IST on 23 Oct; billing on 24 Oct shows only per-message usage lines, no hosting line',
};

export const TESTING = [
  { value: '123', label: 'backend tests (pytest on real Postgres + Redis)' },
  { value: '2', label: 'opt-in live Nugen tests (pytest -m live)' },
  { value: '41', label: 'Playwright tests in 7 files: 25 fully mocked, 16 need a live backend' },
  { value: '6', label: 'CI jobs: ruff, mypy --strict, pytest + alembic check, Docker build, Terraform + kubeconform, UI lint + build' },
];
export const TESTING_NOTE =
  'Tests come first for every bug fix in this log (409 dedup, dev-key, chat overlap, model refresh). CI does not run Playwright; it runs locally. Counts are from the last run before this page shipped.';

export const DEPLOYMENT = [
  { name: 'Vercel', detail: 'React/Vite UI, SPA rewrites, keyless build, bundled snapshot.' },
  { name: 'Render', detail: 'FastAPI in the repo\'s Docker image (non-root); scripts/start.sh migrates, then execs uvicorn on $PORT with proxy headers.' },
  { name: 'Neon', detail: 'Postgres, seeded with the real local data by make demo-seed (FK order, sequences reset).' },
  { name: 'Upstash', detail: 'Redis over TLS: cache, rate limits, demo budget, kill switch.' },
  { name: 'GitHub Actions', detail: '6 jobs on every push and PR.' },
  { name: 'Also in the repo', detail: 'docker-compose, Kubernetes manifests (HPA, PDB), Azure Terraform (AKS, Postgres Flexible, Redis, Key Vault), plan-only.' },
];

export const DECISIONS = [
  { id: 'D12', text: 'Same prompt for base and aligned, no retrieval, so the comparison measures alignment.' },
  { id: 'D13', text: 'Deterministic guardrails can only raise escalation.' },
  { id: 'D25', text: 'Results reported as measured; no prompt tuning to improve them.' },
  { id: 'D30', text: 'JSON repair is field-scoped (policy_ref only) and published as its own labelled row.' },
  { id: 'D33', text: 'Demo spend caps in Redis + per-IP limit; the cap also guards JSON-repair retries.' },
  { id: 'D34', text: '"Latest eval" means the latest real run; offline re-scores are never the default.' },
  { id: 'D37', text: 'On a hosted platform the published dev key is never accepted.' },
  { id: 'D38', text: 'Confidence is labelled by source (Nugen score vs model-reported).' },
  { id: 'D43', text: 'Lifetime demo cap → auto-undeploy the aligned model + Redis kill switch.' },
  { id: 'D44', text: 'Spend guard priced from Nugen\'s rate card (per 1M words, 0.75 words/token).' },
];
export const DECISIONS_NOTE = 'All decisions are logged in DECISIONS.md and marked VETOABLE.';
export const OPEN_QUESTIONS = [
  { id: 'Q10', text: 'Should SUPERSEDED / archived distractor docs be in the alignment corpus at all?' },
  { id: 'Q12', text: 'Does Nugen chat completions support a JSON mode or structured output?' },
  { id: 'Q14', text: 'Should the prompt list real support channels, or a guardrail strip invented contact details?' },
  { id: 'Q15', text: 'Why does billing run ~4–5× above the rate card on evals?' },
];

export const NUGEN_NOTES = [
  { title: 'Duplicate documents → 409', body: 'POST /documents/create returns 409 {detail: {message, document_id}} for content already uploaded, rejecting the whole batch. Not in the API docs; handled by per-file upload + id reuse.' },
  { title: 'Undeploy blocked during auto-eval', body: 'DELETE /models/{id}/deployment returns 409 while the evaluation started by benchmark_id is running, so the deployment stays up until it ends. Handled by waiting, then undeploying.' },
  { title: 'No JSON mode found', body: 'The chat completions docs list no JSON mode or structured output; the aligned 3B model emitted unquoted policy ids in 17 of 40 answers.' },
  { title: 'Confidence events in streams', body: 'Streaming sends one {"object":"confidence"} event per generated span (verified: 4 events for 40 tokens); the non-streaming response carries one confidence_score.' },
];
