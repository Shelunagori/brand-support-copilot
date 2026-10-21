# Open questions (safe default taken for each)

| # | Question | Default taken |
|---|---|---|
| Q1 | Nugen per-token and per-alignment prices are not in the API docs or OpenAPI spec. What does an alignment run cost against the $50 credit? | Estimate inference at $0.20 / 1M tokens (configurable); log alignment calls with a note; check the platform billing page after the run. |
| Q2 | Cookbook uses `num_questions` and `name`/`document_id` list for benchmarks; the OpenAPI spec uses `n_samples` and `name` + single `document_id`. | Follow the OpenAPI spec (`api.nugen.in/openapi-public.json`). |
| Q3 | Shape of streaming `{"object": "confidence"}` events is documented only as "one per generated span"; field name not specified. | Parser accepts `confidence_score`, `confidence` or `score`; the last value seen is used. |
| Q4 | Is `confidence_score` 0-100 on every aligned-model response? | Normalise to 0-1 when present; when absent, fall back to the model's self-reported confidence in its JSON. |
| Q5 | No `NUGEN_API_KEY` was present in the environment or `.env` at start. | Built and tested everything against an HTTP mock; real-API steps run as soon as a key is in `.env`. |
