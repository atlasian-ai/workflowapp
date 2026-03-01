import uuid

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
from app.schemas.approval import ApprovalDecision, ApprovalOut, PendingApprovalOut
from app.services.workflow_engine import get_step_config, process_approval_decision

router = APIRouter()


@router.get("/pending", response_model=list[PendingApprovalOut])
async def list_pending_approvals(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return all pending approvals assigned to the current user."""
    result = await db.execute(
        select(Approval).where(
            Approval.approver_id == user.id,
            Approval.decision.is_(None),
        )
    )
    approvals = result.scalars().all()

    enriched = []
    for approval in approvals:
        inst_result = await db.execute(
            select(WorkflowInstance).where(WorkflowInstance.id == approval.instance_id)
        )
        instance = inst_result.scalar_one_or_none()
        if not instance:
            continue

        def_result = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.id == instance.definition_id
            )
        )
        definition = def_result.scalar_one()

        step_config = get_step_config(definition.config, approval.step_id)
        step_label = step_config["step_label"] if step_config else str(approval.step_id)

        # Get submitter email
        sub_result = await db.execute(
            select(StepSubmission, User).join(
                User, StepSubmission.submitted_by == User.id
            ).where(
                StepSubmission.instance_id == approval.instance_id,
                StepSubmission.step_id == approval.step_id,
                StepSubmission.status == "submitted",
            )
        )
        sub_row = sub_result.first()
        submitted_by_email = sub_row[1].email if sub_row else "unknown"

        enriched.append(
            PendingApprovalOut(
                **{c.key: getattr(approval, c.key) for c in approval.__table__.columns},
                instance_title=instance.title,
                workflow_name=definition.name,
                step_label=step_label,
                submitted_by_email=submitted_by_email,
            )
        )
    return enriched


@router.post("/{instance_id}/steps/{step_id}", response_model=ApprovalOut)
async def decide_approval(
    instance_id: uuid.UUID,
    step_id: int,
    payload: ApprovalDecision,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'")

    # Find the pending approval for this user on this step
    result = await db.execute(
        select(Approval).where(
            Approval.instance_id == instance_id,
            Approval.step_id == step_id,
            Approval.approver_id == user.id,
            Approval.decision.is_(None),
        )
    )
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(
            status_code=404,
            detail="No pending approval found for you on this step",
        )

    # Verify the step has been submitted
    sub_result = await db.execute(
        select(StepSubmission).where(
            StepSubmission.instance_id == instance_id,
            StepSubmission.step_id == step_id,
            StepSubmission.status == "submitted",
        )
    )
    if not sub_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Step has not been submitted yet")

    inst_result = await db.execute(
        select(WorkflowInstance).where(WorkflowInstance.id == instance_id)
    )
    instance = inst_result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    if instance.status != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve/reject a workflow that is '{instance.status}'",
        )

    await process_approval_decision(
        instance=instance,
        approval=approval,
        decision=payload.decision,
        comment=payload.comment,
        approver=user,
        db=db,
    )

    await db.flush()
    await db.refresh(approval)
    return approval


@router.get("/{instance_id}/steps/{step_id}", response_model=list[ApprovalOut])
async def get_step_approvals(
    instance_id: uuid.UUID,
    step_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Approval, User.email.label("approver_email"))
        .outerjoin(User, User.id == Approval.approver_id)
        .where(
            Approval.instance_id == instance_id,
            Approval.step_id == step_id,
        )
    )
    rows = result.all()
    enriched = []
    for approval, approver_email in rows:
        enriched.append(
            ApprovalOut(
                **{c.key: getattr(approval, c.key) for c in approval.__table__.columns},
                approver_email=approver_email,
            )
        )
    return enriched
