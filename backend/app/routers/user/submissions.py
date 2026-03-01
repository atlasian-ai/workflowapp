import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.approval import Approval
from app.models.step_submission import StepSubmission
from app.models.user import User
from app.models.workflow_definition import WorkflowDefinition
from app.models.workflow_instance import WorkflowInstance
from app.schemas.submission import SubmissionOut, SubmissionSave, SubmissionSubmit
from app.services.workflow_engine import (
    activate_step,
    create_step_approval,
    get_next_step_config,
    get_step_config,
)

router = APIRouter()


@router.get("/{instance_id}/all-submissions", response_model=dict[int, dict])
async def get_all_submissions(
    instance_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return all submitted form_data keyed by step_id for cross-step calculated fields."""
    result = await db.execute(
        select(StepSubmission).where(
            StepSubmission.instance_id == instance_id,
            StepSubmission.status == "submitted",
        )
    )
    submissions = result.scalars().all()
    return {sub.step_id: sub.form_data for sub in submissions}


@router.get("/{instance_id}/steps/{step_id}/submission", response_model=Optional[SubmissionOut])
async def get_submission(
    instance_id: uuid.UUID,
    step_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StepSubmission).where(
            StepSubmission.instance_id == instance_id,
            StepSubmission.step_id == step_id,
        )
    )
    return result.scalar_one_or_none()


@router.put("/{instance_id}/steps/{step_id}/submission", response_model=SubmissionOut)
async def save_draft(
    instance_id: uuid.UUID,
    step_id: int,
    payload: SubmissionSave,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Save draft — does not trigger approval."""
    # Guard: completed instances are immutable
    inst_check = await db.execute(
        select(WorkflowInstance).where(WorkflowInstance.id == instance_id)
    )
    inst = inst_check.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Instance not found")
    if inst.status == "completed":
        raise HTTPException(status_code=400, detail="This workflow is complete and cannot be modified")
    if inst.status == "cancelled":
        raise HTTPException(status_code=400, detail="This request has been cancelled and cannot be modified")

    result = await db.execute(
        select(StepSubmission).where(
            StepSubmission.instance_id == instance_id,
            StepSubmission.step_id == step_id,
        )
    )
    submission = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if submission:
        if submission.status == "submitted":
            raise HTTPException(status_code=400, detail="Step already submitted")
        submission.form_data = payload.form_data
        submission.updated_at = now
    else:
        submission = StepSubmission(
            instance_id=instance_id,
            step_id=step_id,
            submitted_by=user.id,
            form_data=payload.form_data,
            status="draft",
        )
        db.add(submission)

    await db.flush()
    await db.refresh(submission)
    return submission


@router.post("/{instance_id}/steps/{step_id}/submit", response_model=SubmissionOut)
async def submit_step(
    instance_id: uuid.UUID,
    step_id: int,
    payload: SubmissionSubmit,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Final submission — marks step as submitted, creates pending approval."""
    # Verify instance exists and step is current
    inst_result = await db.execute(
        select(WorkflowInstance).where(WorkflowInstance.id == instance_id)
    )
    instance = inst_result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    if instance.status == "completed":
        raise HTTPException(status_code=400, detail="This workflow is complete and cannot be modified")
    if instance.status == "rejected":
        # Legacy: instances rejected under the old permanent-rejection flow.
        raise HTTPException(status_code=400, detail="This workflow has been rejected")
    if instance.status == "cancelled":
        raise HTTPException(status_code=400, detail="This request has been cancelled and cannot be modified")
    if instance.current_step_id != step_id:
        raise HTTPException(status_code=400, detail="This is not the current active step")

    # Upsert submission
    sub_result = await db.execute(
        select(StepSubmission).where(
            StepSubmission.instance_id == instance_id,
            StepSubmission.step_id == step_id,
        )
    )
    submission = sub_result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if submission:
        if submission.status == "submitted":
            raise HTTPException(status_code=400, detail="Already submitted")
        submission.form_data = payload.form_data
        submission.status = "submitted"
        submission.submitted_at = now
    else:
        submission = StepSubmission(
            instance_id=instance_id,
            step_id=step_id,
            submitted_by=user.id,
            form_data=payload.form_data,
            status="submitted",
            submitted_at=now,
        )
        db.add(submission)

    # Check for an existing pending (undecided) approval for this step
    approval_result = await db.execute(
        select(Approval).where(
            Approval.instance_id == instance_id,
            Approval.step_id == step_id,
            Approval.decision.is_(None),
        )
    )
    if not approval_result.scalar_one_or_none():
        # No pending approval — either first submission, re-submission after rejection,
        # or a step with no approvers configured.
        def_result = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.id == instance.definition_id
            )
        )
        definition = def_result.scalar_one()
        step_config = get_step_config(definition.config, step_id)

        if step_config and step_config.get("approvers"):
            # Step has approvers → create a fresh approval record.
            # This handles both first-time submission AND re-submission after rejection.
            created = await create_step_approval(instance, step_config, db)
            if not created:
                # Approver spec exists but no matching user/group found in the database.
                # Treat as no-approver and auto-advance rather than leaving the workflow stuck.
                next_step = get_next_step_config(definition.config, step_id)
                if next_step:
                    await activate_step(instance, next_step, db)
                else:
                    instance.status = "completed"
                    instance.completed_at = now
        elif step_config:
            # No approvers configured — auto-advance immediately
            next_step = get_next_step_config(definition.config, step_id)
            if next_step:
                await activate_step(instance, next_step, db)
            else:
                instance.status = "completed"
                instance.completed_at = now

    await db.flush()
    await db.refresh(submission)
    return submission
