import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_admin
from app.models.reference_list import ReferenceList
from app.models.user import User
from app.models.workflow_definition import WorkflowDefinition
from app.schemas.reference_list import ReferenceListCreate, ReferenceListOut
from app.schemas.workflow import WorkflowDefinitionCreate, WorkflowDefinitionOut, WorkflowDefinitionUpdate

router = APIRouter()


@router.get("", response_model=list[WorkflowDefinitionOut])
async def list_workflows(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(WorkflowDefinition).order_by(WorkflowDefinition.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=WorkflowDefinitionOut, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    payload: WorkflowDefinitionCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    wf = WorkflowDefinition(
        name=payload.name,
        description=payload.description,
        config=[step.model_dump() for step in payload.config],
        created_by=admin.id,
    )
    db.add(wf)
    await db.flush()
    await db.refresh(wf)
    return wf


# ─── Reference lists ─────────────────────────────────────────────────────────
# These static-path routes MUST be defined before /{wf_id} so FastAPI does not
# attempt to parse the literal string "reference-lists" as a UUID parameter.

@router.get("/reference-lists", response_model=list[ReferenceListOut])
async def list_reference_lists(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(ReferenceList).order_by(ReferenceList.list_name))
    return result.scalars().all()


@router.post("/reference-lists", response_model=ReferenceListOut, status_code=201)
async def create_reference_list(
    payload: ReferenceListCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    ref = ReferenceList(
        list_name=payload.list_name,
        options=[o.model_dump() for o in payload.options],
    )
    db.add(ref)
    await db.flush()
    await db.refresh(ref)
    return ref


@router.put("/reference-lists/{list_id}", response_model=ReferenceListOut)
async def update_reference_list(
    list_id: uuid.UUID,
    payload: ReferenceListCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(ReferenceList).where(ReferenceList.id == list_id))
    ref = result.scalar_one_or_none()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference list not found")
    ref.list_name = payload.list_name
    ref.options = [o.model_dump() for o in payload.options]
    await db.flush()
    await db.refresh(ref)
    return ref


@router.delete("/reference-lists/{list_id}", status_code=204)
async def delete_reference_list(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(ReferenceList).where(ReferenceList.id == list_id))
    ref = result.scalar_one_or_none()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference list not found")
    await db.delete(ref)


# ─── Workflow by ID ───────────────────────────────────────────────────────────

@router.get("/{wf_id}", response_model=WorkflowDefinitionOut)
async def get_workflow(
    wf_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(WorkflowDefinition).where(WorkflowDefinition.id == wf_id)
    )
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf


@router.put("/{wf_id}", response_model=WorkflowDefinitionOut)
async def update_workflow(
    wf_id: uuid.UUID,
    payload: WorkflowDefinitionUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(WorkflowDefinition).where(WorkflowDefinition.id == wf_id)
    )
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if wf.status == "archived":
        raise HTTPException(
            status_code=400,
            detail="Cannot edit an archived workflow. Create a new version instead.",
        )
    # Published workflows CAN be edited — active instances read live config;
    # completed instances use their frozen config_snapshot.

    if payload.name is not None:
        wf.name = payload.name
    if payload.description is not None:
        wf.description = payload.description
    if payload.config is not None:
        wf.config = [step.model_dump() for step in payload.config]

    await db.flush()
    await db.refresh(wf)
    return wf


@router.post("/{wf_id}/publish", response_model=WorkflowDefinitionOut)
async def publish_workflow(
    wf_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(WorkflowDefinition).where(WorkflowDefinition.id == wf_id)
    )
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if wf.status == "published":
        raise HTTPException(status_code=400, detail="Already published")

    wf.status = "published"
    wf.published_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(wf)
    return wf


@router.post("/{wf_id}/archive", response_model=WorkflowDefinitionOut)
async def archive_workflow(
    wf_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(WorkflowDefinition).where(WorkflowDefinition.id == wf_id)
    )
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf.status = "archived"
    await db.flush()
    await db.refresh(wf)
    return wf
