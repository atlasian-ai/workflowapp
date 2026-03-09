"""AI chat endpoint — data query and workflow builder modes."""
import json
import re
from typing import Any

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.step_submission import StepSubmission
from app.models.user import User
from app.models.workflow_definition import WorkflowDefinition
from app.models.workflow_instance import WorkflowInstance

router = APIRouter()


def _extract_json_array(text: str) -> list | None:
    """Extract a JSON array from a model reply that may include markdown fences or prose."""
    # Strip markdown code fences (```json ... ``` or ``` ... ```)
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = re.sub(r"```", "", cleaned).strip()

    # Direct parse if it starts with [
    if cleaned.startswith("["):
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

    # Find the first [...] block in the text (greedy, handles nested arrays)
    match = re.search(r"\[[\s\S]*\]", cleaned)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return None


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    mode: str  # "data_query" | "workflow_builder"
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    workflow_definition: list[dict[str, Any]] | None = None


# ── Workflow JSON schema description ──────────────────────────────────────────

WORKFLOW_SCHEMA = """
A workflow definition is a JSON array of steps. Each step object:

  step_id       integer — sequential, starting at 1
  step_name     string  — snake_case machine name derived from step_label
                          (e.g. "Purchase Request" → "purchase_request")
  step_label    string  — human-readable label shown in the UI
  approvers     array   — who must approve this step before it advances.
                          Each entry must be "user:email@example.com" or "group:groupname".
                          Use [] if no approval is required for this step.
  form_fields   array   — list of field objects (see below)

Each form_field object:

  field_id      string  — unique snake_case identifier within the workflow
                          (e.g. "vendor_name", "total_amount")
  field_label   string  — human-readable label shown above the input
  field_type    string  — MUST be exactly one of:
                            "textbox"     single-line text
                            "textarea"    multi-line text
                            "number"      numeric input
                            "date"        date picker
                            "dropdown"    select from options list
                            "checkbox"    boolean tick box
                            "file_upload" file attachment
                            "calculated"  auto-computed from other fields
  required      boolean — true if the field must be filled before submitting
  placeholder   string  — optional hint text inside the input
  options       array   — REQUIRED for "dropdown"; list of option strings
                          e.g. ["Option A", "Option B"]
  formula       string  — REQUIRED for "calculated"; arithmetic expression
                          using other field_id names directly (no braces).
                          e.g. "quantity * unit_price"
                          Supports +  -  *  /  and parentheses.

RULES:
- field_id values must be unique across the entire workflow (all steps)
- step_id must be sequential integers starting at 1
- Only include "options" for dropdown fields
- Only include "formula" for calculated fields
- Do not use field types other than the 8 listed above

EXAMPLE — a simple 2-step Purchase Request workflow:
[
  {
    "step_id": 1,
    "step_name": "purchase_request",
    "step_label": "Purchase Request",
    "approvers": [],
    "form_fields": [
      {"field_id": "vendor_name", "field_label": "Vendor Name", "field_type": "textbox", "required": true, "placeholder": "e.g. Acme Corp"},
      {"field_id": "item_description", "field_label": "Item Description", "field_type": "textarea", "required": true},
      {"field_id": "quantity", "field_label": "Quantity", "field_type": "number", "required": true},
      {"field_id": "unit_price", "field_label": "Unit Price (AUD)", "field_type": "number", "required": true},
      {"field_id": "total_amount", "field_label": "Total Amount", "field_type": "calculated", "required": false, "formula": "quantity * unit_price"},
      {"field_id": "urgency", "field_label": "Urgency", "field_type": "dropdown", "required": true, "options": ["Low", "Medium", "High"]},
      {"field_id": "needed_by", "field_label": "Needed By", "field_type": "date", "required": false}
    ]
  },
  {
    "step_id": 2,
    "step_name": "manager_approval",
    "step_label": "Manager Approval",
    "approvers": ["group:managers"],
    "form_fields": [
      {"field_id": "approval_notes", "field_label": "Approval Notes", "field_type": "textarea", "required": false}
    ]
  }
]
"""


def _format_instances_context(instances: list, submissions: dict) -> str:
    lines = []
    for inst in instances:
        status = inst.status
        lines.append(
            f"- REQ_{inst.request_number}: \"{inst.title}\" | status={status}"
            f" | created={inst.created_at.date() if inst.created_at else 'N/A'}"
            f" | step={inst.current_step_id}"
        )
        # Include submitted field values if available
        if inst.id in submissions:
            for step_id, form_data in submissions[inst.id].items():
                if form_data:
                    pairs = ", ".join(f"{k}={v}" for k, v in list(form_data.items())[:5])
                    lines.append(f"    Step {step_id} data: {pairs}")
    return "\n".join(lines) if lines else "(no requests found)"


def _format_definitions_context(definitions: list) -> str:
    lines = []
    for d in definitions:
        step_labels = [s.get("step_label", "") for s in (d.config or [])]
        lines.append(
            f"- \"{d.name}\" | status={d.status} | steps: {', '.join(step_labels)}"
        )
    return "\n".join(lines) if lines else "(no workflows found)"


@router.post("", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI chat is not configured")

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # Build conversation history
    messages = [{"role": m.role, "content": m.content} for m in payload.history]
    messages.append({"role": "user", "content": payload.message})

    if payload.mode == "data_query":
        # Fetch user's instances
        inst_result = await db.execute(
            select(WorkflowInstance).where(WorkflowInstance.created_by == user.id)
        )
        instances = inst_result.scalars().all()

        # Fetch submitted step data for each instance
        submissions: dict = {}
        if instances:
            sub_result = await db.execute(
                select(StepSubmission).where(
                    StepSubmission.instance_id.in_([i.id for i in instances]),
                    StepSubmission.status == "submitted",
                )
            )
            for sub in sub_result.scalars().all():
                submissions.setdefault(sub.instance_id, {})[sub.step_id] = sub.form_data

        # Fetch all published workflow definitions
        def_result = await db.execute(select(WorkflowDefinition))
        definitions = def_result.scalars().all()

        system_prompt = (
            f"You are a helpful assistant for Forgeflow, a workflow management app.\n"
            f"The current user is {user.email} (role: {user.role}).\n\n"
            f"USER'S REQUESTS:\n{_format_instances_context(list(instances), submissions)}\n\n"
            f"AVAILABLE WORKFLOWS:\n{_format_definitions_context(list(definitions))}\n\n"
            f"Answer the user's question based on this data. Be concise and helpful. "
            f"If asked about specific values, refer to the step data provided."
        )

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        )
        return ChatResponse(reply=response.content[0].text)

    elif payload.mode == "workflow_builder":
        system_prompt = (
            "You are a workflow designer assistant for Forgeflow.\n"
            "When the user describes a workflow, return ONLY a valid JSON array of steps "
            "following this schema exactly:\n\n"
            f"{WORKFLOW_SCHEMA}\n\n"
            "If the user asks a question or gives feedback without requesting a workflow, "
            "reply in plain text to help them refine their request.\n"
            "When you do return a workflow JSON, output ONLY the raw JSON array — "
            "no markdown, no code fences, no prose before or after. "
            "The first character of your response must be '[' and the last must be ']'."
        )

        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
        )
        reply_text = response.content[0].text.strip()

        # Try to extract a JSON workflow array from the reply
        workflow_definition = _extract_json_array(reply_text)

        if workflow_definition:
            # Build a clean summary reply instead of exposing raw JSON in the chat bubble
            step_count = len(workflow_definition)
            field_count = sum(len(s.get("form_fields", [])) for s in workflow_definition)
            clean_reply = (
                f"Workflow ready: {step_count} step{'s' if step_count != 1 else ''}, "
                f"{field_count} field{'s' if field_count != 1 else ''}."
            )
            return ChatResponse(reply=clean_reply, workflow_definition=workflow_definition)

        return ChatResponse(reply=reply_text)

    else:
        raise HTTPException(status_code=400, detail=f"Unknown mode: {payload.mode}")
