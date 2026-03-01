import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.step_submission import StepSubmission
from app.models.workflow_definition import WorkflowDefinition
from app.models.workflow_instance import StepAssignment, WorkflowInstance
from app.schemas.instance import InstanceCreate, InstanceDetail, InstanceOut, StepAssignRequest, StepAssignmentOut
from app.services.workflow_engine import initialize_instance

router = APIRouter()


@router.post("", response_model=InstanceOut, status_code=status.HTTP_201_CREATED)
async def create_instance(
    payload: InstanceCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == payload.definition_id,
            WorkflowDefinition.status == "published",
        )
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Published workflow not found")

    instance = WorkflowInstance(
        definition_id=definition.id,
        title=payload.title,
        created_by=user.id,
    )
    db.add(instance)
    await db.flush()  # get instance.id

    await initialize_instance(instance, definition, db)
    await db.flush()
    await db.refresh(instance)
    return instance


@router.get("", response_model=list[InstanceOut])
async def list_my_instances(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Subquery: latest submission updated_at per instance
    latest_sub = (
        select(
            StepSubmission.instance_id,
            func.max(StepSubmission.updated_at).label("last_saved_at"),
        )
        .group_by(StepSubmission.instance_id)
        .subquery()
    )

    result = await db.execute(
        select(WorkflowInstance, latest_sub.c.last_saved_at)
        .outerjoin(latest_sub, WorkflowInstance.id == latest_sub.c.instance_id)
        .where(WorkflowInstance.created_by == user.id)
        .order_by(WorkflowInstance.created_at.desc())
    )
    rows = result.all()
    return [
        InstanceOut(
            **{c.key: getattr(inst, c.key) for c in inst.__table__.columns},
            last_saved_at=last_saved,
        )
        for inst, last_saved in rows
    ]


@router.get("/{instance_id}", response_model=InstanceDetail)
async def get_instance(
    instance_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WorkflowInstance).where(WorkflowInstance.id == instance_id)
    )
    instance = result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    # Fetch definition
    def_result = await db.execute(
        select(WorkflowDefinition).where(WorkflowDefinition.id == instance.definition_id)
    )
    definition = def_result.scalar_one()

    # Fetch assignments
    assign_result = await db.execute(
        select(StepAssignment).where(StepAssignment.instance_id == instance_id)
    )
    assignments = assign_result.scalars().all()

    # Completed instances use their frozen config snapshot so admin edits don't affect them.
    # Active instances always see the live definition config (picks up admin changes).
    workflow_config = (
        instance.config_snapshot
        if instance.status == "completed" and instance.config_snapshot
        else definition.config
    )

    return InstanceDetail(
        **{c.key: getattr(instance, c.key) for c in instance.__table__.columns},
        workflow_name=definition.name,
        workflow_config=workflow_config,
        assignments=[StepAssignmentOut.model_validate(a) for a in assignments],
    )


@router.put("/{instance_id}/steps/{step_id}/assign", response_model=StepAssignmentOut)
async def assign_step(
    instance_id: uuid.UUID,
    step_id: int,
    payload: StepAssignRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify instance exists and belongs to user
    result = await db.execute(
        select(WorkflowInstance).where(WorkflowInstance.id == instance_id)
    )
    instance = result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    if instance.created_by != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    # Verify assigned user exists
    user_result = await db.execute(select(User).where(User.id == payload.assigned_to))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Assigned user not found")

    # Upsert assignment
    existing = await db.execute(
        select(StepAssignment).where(
            StepAssignment.instance_id == instance_id,
            StepAssignment.step_id == step_id,
        )
    )
    assignment = existing.scalar_one_or_none()

    if assignment:
        assignment.assigned_to = payload.assigned_to
        assignment.assigned_by = user.id
    else:
        assignment = StepAssignment(
            instance_id=instance_id,
            step_id=step_id,
            assigned_to=payload.assigned_to,
            assigned_by=user.id,
        )
        db.add(assignment)

    await db.flush()
    await db.refresh(assignment)
    return assignment


@router.post("/{instance_id}/cancel", response_model=InstanceOut)
async def cancel_instance(
    instance_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cancel an in-progress request. Only the original requester may cancel."""
    result = await db.execute(
        select(WorkflowInstance).where(WorkflowInstance.id == instance_id)
    )
    instance = result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    if instance.created_by != user.id:
        raise HTTPException(
            status_code=403, detail="Only the original requester can cancel this request"
        )
    if instance.status != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel a request that is already '{instance.status}'",
        )
    instance.status = "cancelled"
    instance.cancelled_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(instance)
    return instance
