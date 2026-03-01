"""User-facing: browse published workflow definitions."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.reference_list import ReferenceList
from app.models.user import User
from app.models.workflow_definition import WorkflowDefinition
from app.schemas.reference_list import ReferenceListOut
from app.schemas.workflow import WorkflowDefinitionOut

router = APIRouter()


@router.get("", response_model=list[WorkflowDefinitionOut])
async def list_published_workflows(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WorkflowDefinition)
        .where(WorkflowDefinition.status == "published")
        .order_by(WorkflowDefinition.published_at.desc())
    )
    return result.scalars().all()


@router.get("/reference-lists/{list_name}", response_model=ReferenceListOut)
async def get_reference_list(
    list_name: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ReferenceList).where(ReferenceList.list_name == list_name)
    )
    ref = result.scalar_one_or_none()
    if not ref:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Reference list not found")
    return ref
