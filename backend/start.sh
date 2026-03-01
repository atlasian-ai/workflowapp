#!/bin/bash
# Start Celery worker in background, then Uvicorn in foreground.
# Render (and any other host) sends SIGTERM to the foreground process on shutdown.
set -e

echo "Starting Celery worker..."
celery -A app.workers.celery_app worker --loglevel=info --concurrency=1 &
CELERY_PID=$!

echo "Starting Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
