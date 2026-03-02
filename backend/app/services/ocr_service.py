"""
OCR extraction service using Claude's vision API.

Accepts image or PDF bytes and a field extraction spec,
returns a dict of extracted values.
"""

import base64
import io
import json

import anthropic

from app.config import settings

SUPPORTED_MIME_TYPES = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}

MAX_PDF_PAGES = 5
MAX_EXTRACT_FIELDS = 10


def _check_pdf_pages(file_bytes: bytes) -> None:
    """Raise ValueError if a PDF exceeds MAX_PDF_PAGES."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(file_bytes))
        n_pages = len(reader.pages)
        if n_pages > MAX_PDF_PAGES:
            raise ValueError(
                f"Document has {n_pages} pages. "
                f"OCR extraction is limited to {MAX_PDF_PAGES} pages for this PoC."
            )
    except ValueError:
        raise
    except Exception:
        # If pypdf can't read the file, let Claude attempt it anyway.
        pass


def _build_extraction_prompt(extract_fields: dict[str, str]) -> str:
    field_descriptions = "\n".join(
        f"  - {name} ({dtype})" for name, dtype in extract_fields.items()
    )
    return (
        "Extract the following fields from the document image:\n"
        f"{field_descriptions}\n\n"
        "Return ONLY a valid JSON object with these exact field names as keys. "
        "Use null for any field that cannot be found or determined. "
        "Do not include any explanation, markdown, or extra text — JSON only."
    )


def extract_from_document(
    file_bytes: bytes,
    mime_type: str,
    extract_fields: dict[str, str],
) -> dict:
    """
    Call Claude with a document image and return extracted field values.

    Args:
        file_bytes: Raw bytes of the image or PDF.
        mime_type: MIME type string (e.g. "image/png").
        extract_fields: Mapping of field_name → expected_type (string, number, date).

    Returns:
        dict of {field_name: extracted_value}
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    if len(extract_fields) > MAX_EXTRACT_FIELDS:
        raise ValueError(
            f"Too many extraction fields ({len(extract_fields)}). "
            f"Maximum allowed is {MAX_EXTRACT_FIELDS}."
        )

    # Claude vision supports image types; for PDFs we use the document type
    if mime_type == "application/pdf":
        _check_pdf_pages(file_bytes)
        source = {
            "type": "base64",
            "media_type": "application/pdf",
            "data": base64.standard_b64encode(file_bytes).decode("utf-8"),
        }
        content_type = "document"
    else:
        source = {
            "type": "base64",
            "media_type": mime_type,
            "data": base64.standard_b64encode(file_bytes).decode("utf-8"),
        }
        content_type = "image"

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": content_type, "source": source},
                    {"type": "text", "text": _build_extraction_prompt(extract_fields)},
                ],
            }
        ],
    )

    raw_text = message.content[0].text.strip()

    # Robustly extract JSON from the response
    start = raw_text.find("{")
    end = raw_text.rfind("}") + 1
    if start == -1 or end == 0:
        return {field: None for field in extract_fields}

    try:
        return json.loads(raw_text[start:end])
    except json.JSONDecodeError:
        return {field: None for field in extract_fields}
