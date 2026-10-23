# One-command live run against the real Nugen API (needs NUGEN_API_KEY in .env).
#   make align-and-eval
# Every paid step goes through the spend guard (hard stop at NUGEN_SPEND_HARD_LIMIT_USD).

PY ?= uv run python
WAIT_MIN ?= 60

.PHONY: help up migrate test lint wait-api estimate smoke align deploy eval-initial \
        seed-feedback realign eval-realigned report align-and-eval api worker ui screenshots

help:
	@grep -E '^[a-z-]+:' Makefile | cut -d: -f1 | tr '\n' ' '; echo

up:                ## postgres + redis
	docker compose up -d --wait postgres redis

migrate: up
	uv run alembic upgrade head

test: up
	uv run pytest -q

lint:
	uv run ruff check app tests && uv run mypy app

wait-api:          ## block until api.nugen.in/health is 200
	$(PY) -m app.cli wait-api --timeout-min $(WAIT_MIN)

estimate:          ## log a cost estimate; exits non-zero if it would cross the cap
	$(PY) -m app.cli estimate

smoke:             ## one tiny paid inference
	$(PY) -m app.cli smoke

align:             ## upload docs + benchmark, run alignment, wait for READY
	$(PY) -m app.cli align --yes

deploy:
	$(PY) -m app.cli deploy

eval-initial:
	$(PY) -m app.eval run --models base,aligned --label "initial alignment"

seed-feedback:     ## real inferences on data/feedback/seed.jsonl + reviewer corrections
	$(PY) -m app.feedback_seed

realign:           ## corrections dataset -> re-align -> deploy
	$(PY) -m app.cli realign --yes --deploy

eval-realigned:
	$(PY) -m app.eval run --models base,aligned --label "after re-alignment"

report:
	$(PY) -m app.cli spend
	@echo "reports/eval_report.md updated"

align-and-eval: migrate wait-api estimate smoke align deploy eval-initial seed-feedback realign eval-realigned report

api:
	uv run uvicorn --factory app.api.main:create_app --port 8000

worker:
	uv run arq app.worker.WorkerSettings

ui:
	cd ui && npm install && npm run dev

screenshots:       ## needs api (:8000) running
	cd ui && npx playwright test e2e/screenshots.spec.ts

# ---------------------------------------------------------------- local demo
# The Exp 3 aligned model (Llama-3.2-3B, ACTIVE docs). Undeployed by default to save credits:
# the UI then answers with the base model and shows an "aligned model offline" badge.
EXP3_MODEL ?= model_01m5hz9nr9gr5wqv
DEMO_BASE_MODEL ?= meta-llama/Llama-3.2-3B-Instruct

.PHONY: demo-api demo-ui demo-cost demo-redeploy demo-undeploy

demo-api: migrate  ## API on :8000 with the Exp 3 base model (like-for-like with the aligned one)
	NUGEN_BASE_MODEL_ID=$(DEMO_BASE_MODEL) uv run uvicorn --factory app.api.main:create_app --port 8000

demo-ui:           ## UI on :5173 (proxies /api to :8000)
	cd ui && npm install && npm run dev

demo-cost:         ## free: expected cost of a live demo
	$(PY) -m app.cli demo-cost

demo-redeploy: demo-cost  ## PAID: redeploy the Exp 3 aligned model (asks first)
	@printf "Redeploy $(EXP3_MODEL)? Deployment uptime may be billed per hour. [y/N] "; \
	read a; [ "$$a" = "y" ] || { echo "aborted, nothing deployed"; exit 1; }
	$(PY) -m app.cli deploy --model-id $(EXP3_MODEL) --poll-interval 15
	@if grep -q '^DEMO_DATABASE_URL=.' .env 2>/dev/null; then $(MAKE) demo-seed demo-snapshot; \
	  echo "public demo: Neon updated, the live API switches to the aligned model within ~30 s"; fi

demo-undeploy:     ## turn the aligned model off again (free)
	$(PY) -m app.cli undeploy $(EXP3_MODEL)
	@if grep -q '^DEMO_DATABASE_URL=.' .env 2>/dev/null; then $(MAKE) demo-seed demo-snapshot; fi

# ---------------------------------------------------------------- public demo (Render + Vercel)
.PHONY: demo-snapshot demo-seed demo-smoke demo-local

demo-snapshot:     ## real local data -> ui/public/demo-snapshot.json (UI shows it while the API wakes)
	$(PY) -m app.demo_snapshot

demo-seed: up      ## WIPES + reseeds the Neon demo DB (DEMO_DATABASE_URL in .env) with the real local data
	$(PY) -m app.demo_seed --yes

demo-smoke:        ## make demo-smoke API=https://x.onrender.com UI=https://y.vercel.app [CODE=...] [CHAT=--chat]
	$(PY) -m app.demo_smoke --api $(API) --ui $(UI) $(if $(CODE),--code $(CODE)) $(CHAT)

demo-local: migrate  ## run the API locally exactly as on Render (demo mode)
	DEMO_MODE=true DEMO_ACCESS_CODE=$${DEMO_ACCESS_CODE:-local-demo} NUGEN_BASE_MODEL_ID=$(DEMO_BASE_MODEL) \
	uv run uvicorn --factory app.api.main:create_app --port 8000 --proxy-headers
