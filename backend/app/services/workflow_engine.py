"""
Workflow state machine engine.

Responsibilities:
- Activate the first step when an instance is created
- Resolve approver specs (group:xxx / user:email) to User records
- Create approval records when a step is submitted (not at activation time)
- Advance to next step on approval
- Reset submission to draft on rejection so the requester can resubmit
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.approval import Approval
from app.models.group import Group, UserGroupMembership
from app.models.step_submission import StepSubmission
from app.models.user import User
from app.models.workflow_definition import WorkflowDefinition
from app.models.workflow_instance import WorkflowInstance


async def resolve_approvers(approver_specs: list[str], db: AsyncSession) -> list[User]:
    """
    Resolve a list of approver specs to User objects.

    Supported formats:
      - "group:reviewers"         → all active users in the group named "reviewers"
      - "user:john@company.com"   → the user with that email
      - "john@company.com"        → bare email (no prefix) — treated the same as user:email
    """
    users: list[User] = []
    seen_ids: set[uuid.UUID] = set()

    for spec in approver_specs:
        if spec.startswith("group:"):
            group_name = spec[6:].strip()
            result = await db.execute(
                select(User)
                .join(UserGroupMembership, User.id == UserGroupMembership.user_id)
                .join(Group, Group.id == UserGroupMembership.group_id)
                .where(Group.name == group_name, User.is_active.is_(True))
            )
            for user in result.scalars().all():
                if user.id not in seen_ids:
                    users.append(user)
                    seen_ids.add(user.id)

        elif spec.startswith("user:"):
            email = spec[5:].strip()
            result = await db.execute(
                select(User).where(User.email == email, User.is_active.is_(True))
            )
            user = result.scalar_one_or_none()
            if user and user.id not in seen_ids:
                users.append(user)
                seen_ids.add(user.id)

        elif "@" in spec:
            # Fallback: bare email address without the "user:" prefix.
            # Handles configs saved by admins who omitted the prefix.
            email = spec.strip()
            result = await db.execute(
                select(User).where(User.email == email, User.is_active.is_(True))
            )
            user = result.scalar_one_or_none()
            if user and user.id not in seen_ids:
                users.append(user)
                seen_ids.add(user.id)

    return users


def get_step_config(config: List[Dict], step_id: int) -> Optional[Dict]:
    """Find a step by step_id in the workflow config array."""
    for step in config:
        if step["step_id"] == step_id:
            return step
    return None


def get_next_step_config(config: List[Dict], current_step_id: int) -> Optional[Dict]:
    """Return the next step after current_step_id, or None if this is the last step."""
    sorted_steps = sorted(config, key=lambda s: s["step_id"])
    for i, step in enumerate(sorted_steps):
        if step["step_id"] == current_step_id:
            if i + 1 < len(sorted_steps):
                return sorted_steps[i + 1]
            return None
    return None


async def activate_step(
    instance: WorkflowInstance,
    step_config: dict,
    db: AsyncSession,
) -> None:
    """
    Set instance.current_step_id when a new step becomes active.

    Approval creation is intentionally NOT done here — it happens in submit_step
    so that reviewers only see items that are actually ready for review.
    """
    instance.current_step_id = step_config["step_id"]


async def create_step_approval(
    instance: WorkflowInstance,
    step_config: dict,
    db: AsyncSession,
) -> Optional[Approval]:
    """
    Create a pending Approval record for the first resolved approver of this step.

    Called from submit_step (first submission and re-submissions after rejection).
    Returns the created Approval, or None if no approvers could be resolved from the specs.
    """
    approver_specs: list[str] = step_config.get("approvers", [])
    approvers = await resolve_approvers(approver_specs, db)

    if not approvers:
        return None

    approval = Approval(
        instance_id=instance.id,
        step_id=step_config["step_id"],
        approver_id=approvers[0].id,
    )
    db.add(approval)
    return approval


async def initialize_instance(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
    db: AsyncSession,
) -> None:
    """Activate the first step of a newly created instance."""
    config: list[dict] = definition.config
    if not config:
        instance.status = "completed"
        instance.completed_at = datetime.now(timezone.utc)
        return

    first_step = sorted(config, key=lambda s: s["step_id"])[0]
    await activate_step(instance, first_step, db)


async def process_approval_decision(
    instance: WorkflowInstance,
    approval: Approval,
    decision: str,
    comment: Optional[str],
    approver: User,
    db: AsyncSession,
) -> None:
    """
    Apply an approve/reject decision and advance the state machine.

    - approved + has next step  → activate next step (approval created on next submit)
    - approved + last step      → mark instance completed
    - rejected                  → reset submission to draft so requester can edit & resubmit;
                                   instance stays in_progress (rejection is not terminal)
    """
    now = datetime.now(timezone.utc)
    approval.decision = decision
    approval.comment = comment
    approval.decided_at = now

    # Reload definition config
    result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == instance.definition_id
        )
    )
    definition = result.scalar_one()
    config: list[dict] = definition.config

    if decision == "rejected":
        # Reset the step submission to draft so the requester can edit and resubmit.
        # The instance intentionally stays "in_progress" — rejection is no longer terminal.
        sub_result = await db.execute(
            select(StepSubmission).where(
                StepSubmission.instance_id == instance.id,
                StepSubmission.step_id == approval.step_id,
                StepSubmission.status == "submitted",
            )
        )
        submission = sub_result.scalar_one_or_none()
        if submission:
            submission.status = "draft"
        return

    # Approved — try to advance to next step
    next_step = get_next_step_config(config, instance.current_step_id)

    if next_step is None:
        # All steps done — freeze the config so future admin edits don't affect this record
        instance.status = "completed"
        instance.completed_at = now
        instance.config_snapshot = list(config)
    else:
        await activate_step(instance, next_step, db)
