from celery import Celery

from app.config import settings

celery_app = Celery(
    "workflowapp",
    broker=settings.upstash_redis_url,
    backend=settings.upstash_redis_url,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)
