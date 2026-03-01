"""Background Celery tasks."""

from app.services import ocr_service, storage_service
from app.workers.celery_app import celery_app


@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def ocr_extract_task(
    self,
    r2_key: str,
    mime_type: str,
    extract_fields: dict,
) -> dict:
    """
    Download file from R2, run OCR extraction via Claude, return results.

    Called asynchronously so that the API response is fast.
    The frontend polls for the task result using the task ID.
    """
    try:
        file_bytes = storage_service.get_file_bytes(r2_key)
        result = ocr_service.extract_from_document(file_bytes, mime_type, extract_fields)
        return result
    except Exception as exc:
        raise self.retry(exc=exc)
