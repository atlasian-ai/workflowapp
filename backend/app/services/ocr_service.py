"""
OCR extraction service using Claude's vision API.

Accepts image or PDF bytes and a field extraction spec,
returns a dict of extracted values.
"""

import base64
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

    # Claude vision supports image types; for PDFs we use the document type
    if mime_type == "application/pdf":
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
