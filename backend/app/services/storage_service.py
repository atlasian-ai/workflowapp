"""Supabase Storage service.

Calls the Supabase Storage REST API directly using httpx so the implementation
is independent of supabase-py release changes.

Bucket:  settings.supabase_storage_bucket  (default: "workflow-files")
Auth:    service key via Authorization / apikey headers
"""

import uuid

import httpx

from app.config import settings


def _headers() -> dict:
    key = settings.supabase_service_key
    return {
        "Authorization": f"Bearer {key}",
        "apikey": key,
    }


def _base_url() -> str:
    """Return the Supabase base URL with any trailing slash stripped."""
    return settings.supabase_url.rstrip("/")


def _object_url(path: str = "") -> str:
    base = f"{_base_url()}/storage/v1/object/{settings.supabase_storage_bucket}"
    return f"{base}/{path}" if path else base


def upload_file(
    file_bytes: bytes,
    file_name: str,
    mime_type: str,
    prefix: str = "uploads",
) -> str:
    """Upload bytes to Supabase Storage and return the storage path."""
    ext = file_name.rsplit(".", 1)[-1] if "." in file_name else ""
    path = f"{prefix}/{uuid.uuid4().hex}.{ext}" if ext else f"{prefix}/{uuid.uuid4().hex}"

    resp = httpx.post(
        _object_url(path),
        content=file_bytes,
        headers={**_headers(), "Content-Type": mime_type, "x-upsert": "false"},
        timeout=120.0,
    )
    resp.raise_for_status()
    return path


def get_presigned_download_url(storage_path: str, expires_in: int = 3600) -> str:
    """Generate a Supabase signed URL valid for `expires_in` seconds."""
    base = _base_url()
    sign_url = f"{base}/storage/v1/object/sign/{settings.supabase_storage_bucket}/{storage_path}"
    resp = httpx.post(
        sign_url,
        json={"expiresIn": expires_in},
        headers=_headers(),
        timeout=15.0,
    )
    resp.raise_for_status()
    data = resp.json()
    # Supabase returns "signedURL" (older) or "signedUrl" (newer API versions)
    signed_path = data.get("signedURL") or data.get("signedUrl") or ""
    if not signed_path:
        raise ValueError(f"Unexpected sign response from Supabase: {data}")
    # signed_path is like /storage/v1/object/sign/bucket/path?token=...
    return f"{base}{signed_path}"


def get_file_bytes(storage_path: str) -> bytes:
    """Download file bytes from Supabase Storage (used by OCR service)."""
    resp = httpx.get(_object_url(storage_path), headers=_headers(), timeout=120.0)
    resp.raise_for_status()
    return resp.content
