import ssl

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

# Upstash (and any rediss:// broker) requires explicit SSL settings —
# Celery won't infer them from the URL scheme alone.
if settings.upstash_redis_url.startswith("rediss://"):
    _ssl_opts = {"ssl_cert_reqs": ssl.CERT_NONE}
    celery_app.conf.update(
        broker_use_ssl=_ssl_opts,
        redis_backend_use_ssl=_ssl_opts,
    )
