#!/bin/sh
# Container entrypoint: migrate, then hand PID 1 to uvicorn (clean SIGTERM on redeploys).
# Plain sh (no bash-isms) so it works in python:slim; hosts that don't run shell syntax in
# their "start command" field (e.g. Render's Docker Command) can just use the image CMD.
set -e
alembic upgrade head
exec uvicorn --factory app.api.main:create_app --host 0.0.0.0 --port "${PORT:-8000}" \
  --proxy-headers --forwarded-allow-ips='*'
