# Open questions (safe default taken for each)

| # | Question | Default taken |
|---|---|---|
| Q1 | Nugen per-token and per-alignment prices are not in the API docs or OpenAPI spec. What does an alignment run cost against the $50 credit? | Estimate inference at $0.20 / 1M tokens (configurable); log alignment calls with a note; check the platform billing page after the run. |
| Q2 | Cookbook uses `num_questions` and `name`/`document_id` list for benchmarks; the OpenAPI spec uses `n_samples` and `name` + single `document_id`. | Follow the OpenAPI spec (`api.nugen.in/openapi-public.json`). |
| Q3 | Shape of streaming `{"object": "confidence"}` events is documented only as "one per generated span"; field name not specified. | Parser accepts `confidence_score`, `confidence` or `score`; the last value seen is used. |
| Q4 | Is `confidence_score` 0-100 on every aligned-model response? | Normalise to 0-1 when present; when absent, fall back to the model's self-reported confidence in its JSON. |
| Q5 | No `NUGEN_API_KEY` was present at start (added later by the user). | Built and tested everything against an HTTP mock first. |
| Q6 | `api.nugen.in` returned HTTP 522 from 18:44 IST on 2026-10-21 (cf-ray `a4e0a435dc76052e-DEL`) while status.nugen.in said operational. **Resolved** by 2026-10-22; the live run completed. | `make align-and-eval` waits for `/health` = 200. |
| Q7 | Real per-alignment price is unknown. | Budget $10 per alignment in the spend guard (2 runs = $20 of the $40 cap); reconcile with platform billing after the run. |
| Q8 | Document dedup: `POST /documents/create` answers 409 `{detail: {message, document_id}}` for content already uploaded. Is this documented or stable? | Per-file upload + reuse the returned id (D23). |
| Q9 | Run-2 eval latency (p95 ~3 min on base *and* aligned) coincided with Nugen's own evaluation and two deployments. Is inference throughput shared across a single org's deployments or evaluations? | Reported as an infra effect, not a model effect. Re-run the eval in isolation before quoting latency. |
| Q10 | Should the SUPERSEDED / archived distractor docs be in the alignment corpus at all? The aligned model repeated the superseded 30-day rule. | Kept them (the brief asked for them); the next experiment trains on ACTIVE docs only. |
| Q11 | Streaming sends one `{"object":"confidence"}` event per generated span (verified live: 4 events for 40 tokens, values 40.5–60.3, parsed correctly). Which aggregate best represents the answer? | The service uses the last span's score; the mean or the minimum may be a better signal for low-confidence flagging. |
