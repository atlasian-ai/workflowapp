"""File upload and OCR extraction endpoints.

Upload flow (FileUploadField):
  1. Frontend uploads the file directly to Supabase Storage using the JS client.
  2. Frontend calls POST /files/register with the resulting storage_path + metadata.
  3. Backend persists a FileAttachment row; the storage_path is stored in r2_key.

Download flow:
  GET /files/download?path=<storage_path>&name=<original_filename>
  Backend fetches the file from Supabase using the service key and streams it directly.

OCR flow (OcrReaderField):
  POST /files/upload  — still handled server-side so the Celery worker can access it.
"""

import io
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.file_attachment import FileAttachment
from app.models.user import User
from app.services import storage_service

ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
}

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

router = APIRouter()


# ─── Register a client-side Supabase upload ──────────────────────────────────

class FileRegisterPayload(BaseModel):
    storage_path: str
    file_name: str
    mime_type: Optional[str] = None
    field_id: str
    instance_id: Optional[str] = None
    step_id: Optional[int] = None


@router.post("/register")
async def register_file(
    payload: FileRegisterPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Record a file that was uploaded directly to Supabase Storage by the frontend."""
    attachment = FileAttachment(
        instance_id=uuid.UUID(payload.instance_id) if payload.instance_id else None,
        step_id=payload.step_id,
        field_id=payload.field_id,
        r2_key=payload.storage_path,  # column repurposed as generic storage_path
        file_name=payload.file_name,
        mime_type=payload.mime_type,
        uploaded_by=user.id,
    )
    db.add(attachment)
    await db.flush()
    return {
        "storage_path": payload.storage_path,
        "file_name": payload.file_name,
        "mime_type": payload.mime_type,
    }


# ─── File download (streamed through backend) ─────────────────────────────────

@router.get("/download")
async def download_file(
    path: str = Query(..., description="Storage path of the file"),
    name: str = Query("download", description="Original filename for Content-Disposition"),
    _user: User = Depends(get_current_user),
):
    """Stream a file from Supabase Storage through the backend using the service key."""
    if not path or "//" in path:
        raise HTTPException(status_code=400, detail="Invalid storage path")
    try:
        file_bytes = storage_service.get_file_bytes(path)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Storage error: {exc}") from exc

    safe_name = name.replace('"', '\\"')
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


# ─── Server-side upload (OCR) ─────────────────────────────────────────────────

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    instance_id: Optional[str] = Form(None),
    step_id: Optional[int] = Form(None),
    field_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a file server-side (used by OCR). Returns the storage_path."""
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    try:
        storage_path = storage_service.upload_file(
            file_bytes=file_bytes,
            file_name=file.filename or "upload",
            mime_type=file.content_type,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Storage error: {exc}") from exc

    attachment = FileAttachment(
        instance_id=uuid.UUID(instance_id) if instance_id else None,
        step_id=step_id,
        field_id=field_id,
        r2_key=storage_path,
        file_name=file.filename or "upload",
        mime_type=file.content_type,
        uploaded_by=user.id,
    )
    db.add(attachment)
    await db.flush()

    return {
        "storage_path": storage_path,
        # keep r2_key alias so OcrReaderField still works without changes
        "r2_key": storage_path,
        "file_name": file.filename,
        "mime_type": file.content_type,
    }


# ─── OCR endpoints (unchanged) ───────────────────────────────────────────────

@router.post("/ocr")
async def trigger_ocr(
    file: UploadFile = File(...),
    extract_fields: str = Form(...),
    _user: User = Depends(get_current_user),
):
    """Upload a document and trigger OCR extraction via Claude."""
    import json

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    try:
        fields = json.loads(extract_fields)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="extract_fields must be valid JSON")

    if not isinstance(fields, dict):
        raise HTTPException(status_code=400, detail="extract_fields must be a JSON object")

    if len(fields) > 10:
        raise HTTPException(
            status_code=400,
            detail="Maximum 10 extraction fields allowed per OCR request (PoC limit).",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    try:
        storage_path = storage_service.upload_file(
            file_bytes=file_bytes,
            file_name=file.filename or "ocr_upload",
            mime_type=file.content_type,
            prefix="ocr_temp",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Storage error: {exc}") from exc

    from app.workers.tasks import ocr_extract_task
    task = ocr_extract_task.delay(storage_path, file.content_type, fields)
    return {"task_id": task.id}


@router.get("/ocr/result/{task_id}")
async def get_ocr_result(
    task_id: str,
    _user: User = Depends(get_current_user),
):
    """Poll for OCR task result."""
    from app.workers.celery_app import celery_app
    from celery.result import AsyncResult

    result = AsyncResult(task_id, app=celery_app)

    if result.state == "PENDING":
        return {"status": "pending"}
    elif result.state == "SUCCESS":
        return {"status": "success", "data": result.result}
    elif result.state == "FAILURE":
        return {"status": "error", "detail": str(result.result)}
    else:
        return {"status": result.state.lower()}
