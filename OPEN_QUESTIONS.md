# Open questions (safe default taken for each)

| # | Question | Default taken |
|---|---|---|
| Q1 | Nugen per-token and per-alignment prices are not in the API docs or OpenAPI spec. What does an alignment run cost against the $50 credit? | Estimate inference at $0.20 / 1M tokens (configurable); log alignment calls with a note; check the platform billing page after the run. |
| Q2 | Cookbook uses `num_questions` and `name`/`document_id` list for benchmarks; the OpenAPI spec uses `n_samples` and `name` + single `document_id`. | Follow the OpenAPI spec (`api.nugen.in/openapi-public.json`). |
| Q3 | Shape of streaming `{"object": "confidence"}` events is documented only as "one per generated span"; field name not specified. | Parser accepts `confidence_score`, `confidence` or `score`; the last value seen is used. |
| Q4 | Is `confidence_score` 0-100 on every aligned-model response? | Normalise to 0-1 when present; when absent, fall back to the model's self-reported confidence in its JSON. |
| Q5 | No `NUGEN_API_KEY` was present at start (added later by the user). | Built and tested everything against an HTTP mock first. |
| Q6 | `api.nugen.in` returns HTTP 522 on every path from 18:44 IST on 2026-10-21 (user cf-ray `a4e0a435dc76052e-DEL`, 19:05 IST), while status.nugen.in says operational. | Live run deferred; `make align-and-eval` waits for `/health` = 200, then runs end to end. Results table marked "pending live run". |
| Q7 | Real per-alignment price is unknown. | Budget $10 per alignment in the spend guard (2 runs = $20 of the $40 cap); reconcile with platform billing after the run. |
