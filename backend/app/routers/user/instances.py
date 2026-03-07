import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
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

    # Return instances the user created OR is assigned to (full delegation)
    result = await db.execute(
        select(WorkflowInstance, latest_sub.c.last_saved_at)
        .outerjoin(latest_sub, WorkflowInstance.id == latest_sub.c.instance_id)
        .outerjoin(StepAssignment, StepAssignment.instance_id == WorkflowInstance.id)
        .where(
            or_(
                WorkflowInstance.created_by == user.id,
                StepAssignment.assigned_to == user.id,
            )
        )
        .distinct(WorkflowInstance.id)
        .order_by(WorkflowInstance.id, WorkflowInstance.created_at.desc())
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

    # Fetch assignments with resolved user names
    assign_result = await db.execute(
        select(StepAssignment, User)
        .join(User, User.id == StepAssignment.assigned_to)
        .where(StepAssignment.instance_id == instance_id)
    )
    assignment_rows = assign_result.all()

    # Access control: creator, admin, or any assigned user may view
    assigned_user_ids = {row.User.id for row in assignment_rows}
    if (
        instance.created_by != user.id
        and user.role != "admin"
        and user.id not in assigned_user_ids
    ):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Resolve assigned_by names
    assigner_ids = {row.StepAssignment.assigned_by for row in assignment_rows}
    assigner_map: dict[uuid.UUID, User] = {}
    if assigner_ids:
        assigner_result = await db.execute(select(User).where(User.id.in_(assigner_ids)))
        for u in assigner_result.scalars().all():
            assigner_map[u.id] = u

    # Build enriched assignment objects
    enriched_assignments = []
    for row in assignment_rows:
        a = row.StepAssignment
        assignee = row.User
        assigner = assigner_map.get(a.assigned_by)
        enriched_assignments.append(
            StepAssignmentOut(
                id=a.id,
                instance_id=a.instance_id,
                step_id=a.step_id,
                assigned_to=a.assigned_to,
                assigned_by=a.assigned_by,
                assigned_at=a.assigned_at,
                assigned_to_name=assignee.full_name or assignee.email,
                assigned_to_email=assignee.email,
                assigned_by_name=assigner.full_name or assigner.email if assigner else None,
            )
        )

    # Fetch definition
    def_result = await db.execute(
        select(WorkflowDefinition).where(WorkflowDefinition.id == instance.definition_id)
    )
    definition = def_result.scalar_one()

    # Completed instances use their frozen config snapshot
    workflow_config = (
        instance.config_snapshot
        if instance.status == "completed" and instance.config_snapshot
        else definition.config
    )

    return InstanceDetail(
        **{c.key: getattr(instance, c.key) for c in instance.__table__.columns},
        workflow_name=definition.name,
        workflow_config=workflow_config,
        assignments=enriched_assignments,
    )


@router.put("/{instance_id}/steps/{step_id}/assign", response_model=StepAssignmentOut)
async def assign_step(
    instance_id: uuid.UUID,
    step_id: int,
    payload: StepAssignRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify instance exists
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
    assignee = user_result.scalar_one_or_none()
    if not assignee:
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

    assigner_result = await db.execute(select(User).where(User.id == user.id))
    assigner = assigner_result.scalar_one()

    return StepAssignmentOut(
        id=assignment.id,
        instance_id=assignment.instance_id,
        step_id=assignment.step_id,
        assigned_to=assignment.assigned_to,
        assigned_by=assignment.assigned_by,
        assigned_at=assignment.assigned_at,
        assigned_to_name=assignee.full_name or assignee.email,
        assigned_to_email=assignee.email,
        assigned_by_name=assigner.full_name or assigner.email,
    )


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
