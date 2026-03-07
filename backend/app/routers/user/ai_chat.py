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
A workflow definition is a JSON array of steps. Each step has:
{
  "step_id": <integer, sequential starting at 1>,
  "step_name": <string, machine name like "step_1">,
  "step_label": <string, human readable label>,
  "approvers": <array of email strings, or [] if no approval needed>,
  "form_fields": [
    {
      "field_id": <string, snake_case unique id>,
      "field_label": <string, human readable>,
      "field_type": <one of: "textbox", "textarea", "number", "date", "dropdown", "radio", "checkbox", "file_upload", "calculated", "table">,
      "required": <boolean>,
      "placeholder": <string, optional>,
      "options": <array of strings, only for dropdown/radio/checkbox>,
      "formula": <string, only for calculated fields, uses {field_id} references>
    }
  ]
}

Return ONLY the JSON array with no markdown, no code fences, no extra explanation.
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
            "reply in plain text to help them refine their request. "
            "When you do return a workflow JSON, output ONLY the raw JSON array — "
            "no markdown, no code fences, no explanation before or after."
        )

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
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
