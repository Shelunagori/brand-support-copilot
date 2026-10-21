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
