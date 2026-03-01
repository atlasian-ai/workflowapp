"""
Step comments and @mention notifications.

Three routers are exported:
  - router              → mounted at /instances (handles GET/POST on step comments)
  - notifications_router → mounted at /notifications
  - users_router         → mounted at /users (minimal user list for @mention picker)
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.step_comment import CommentMention, StepComment
from app.models.user import User
from app.models.workflow_definition import WorkflowDefinition
from app.models.workflow_instance import WorkflowInstance
from app.schemas.comment import CommentCreate, CommentOut, NotificationOut, UnreadCountOut
from app.services.workflow_engine import get_step_config

router = APIRouter()
notifications_router = APIRouter()
users_router = APIRouter()


# ─── Mention user lookup ──────────────────────────────────────────────────────

class MentionUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    full_name: Optional[str]


@users_router.get("", response_model=list[MentionUserOut])
async def list_users_for_mention(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return all active users — used by the @mention picker on the frontend."""
    result = await db.execute(
        select(User).where(User.is_active.is_(True)).order_by(User.email)
    )
    return result.scalars().all()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _comment_preview(text: str, max_len: int = 120) -> str:
    return text[:max_len] + "…" if len(text) > max_len else text


async def _get_step_label(instance: WorkflowInstance, step_id: int, db: AsyncSession) -> str:
    result = await db.execute(
        select(WorkflowDefinition).where(WorkflowDefinition.id == instance.definition_id)
    )
    definition = result.scalar_one_or_none()
    if not definition:
        return str(step_id)
    step = get_step_config(
        instance.config_snapshot if instance.status == "completed" and instance.config_snapshot
        else definition.config,
        step_id,
    )
    return step["step_label"] if step else str(step_id)


# ─── Comments ────────────────────────────────────────────────────────────────

@router.get("/{instance_id}/steps/{step_id}/comments", response_model=list[CommentOut])
async def list_comments(
    instance_id: uuid.UUID,
    step_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StepComment, User)
        .join(User, StepComment.author_id == User.id)
        .where(
            StepComment.instance_id == instance_id,
            StepComment.step_id == step_id,
        )
        .order_by(StepComment.created_at.asc())
    )
    rows = result.all()
    return [
        CommentOut(
            id=comment.id,
            instance_id=comment.instance_id,
            step_id=comment.step_id,
            author_id=comment.author_id,
            author_email=author.email,
            author_name=author.full_name,
            content=comment.content,
            created_at=comment.created_at,
        )
        for comment, author in rows
    ]


@router.post("/{instance_id}/steps/{step_id}/comments", response_model=CommentOut, status_code=201)
async def create_comment(
    instance_id: uuid.UUID,
    step_id: int,
    payload: CommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Comment content cannot be empty")

    # Verify instance exists
    inst_result = await db.execute(
        select(WorkflowInstance).where(WorkflowInstance.id == instance_id)
    )
    instance = inst_result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    comment = StepComment(
        instance_id=instance_id,
        step_id=step_id,
        author_id=user.id,
        content=payload.content.strip(),
    )
    db.add(comment)
    await db.flush()  # get comment.id

    # Create mention records for each @mentioned user
    for mentioned_id in set(payload.mentioned_user_ids):
        # Don't notify the author themselves
        if mentioned_id == user.id:
            continue
        # Verify mentioned user exists
        user_result = await db.execute(select(User).where(User.id == mentioned_id))
        if not user_result.scalar_one_or_none():
            continue
        mention = CommentMention(
            comment_id=comment.id,
            instance_id=instance_id,
            step_id=step_id,
            mentioned_user_id=mentioned_id,
        )
        db.add(mention)

    await db.flush()

    return CommentOut(
        id=comment.id,
        instance_id=comment.instance_id,
        step_id=comment.step_id,
        author_id=comment.author_id,
        author_email=user.email,
        author_name=user.full_name,
        content=comment.content,
        created_at=comment.created_at,
    )


# ─── Notifications ────────────────────────────────────────────────────────────

@notifications_router.get("/unread-count", response_model=UnreadCountOut)
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(func.count()).where(
            CommentMention.mentioned_user_id == user.id,
            CommentMention.is_read.is_(False),
        )
    )
    count = result.scalar_one()
    return UnreadCountOut(count=count)


@notifications_router.get("", response_model=list[NotificationOut])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CommentMention, StepComment, User, WorkflowInstance)
        .join(StepComment, CommentMention.comment_id == StepComment.id)
        .join(User, StepComment.author_id == User.id)
        .join(WorkflowInstance, CommentMention.instance_id == WorkflowInstance.id)
        .where(CommentMention.mentioned_user_id == user.id)
        .order_by(CommentMention.created_at.desc())
    )
    rows = result.all()

    notifications = []
    for mention, comment, author, instance in rows:
        step_label = await _get_step_label(instance, mention.step_id, db)
        notifications.append(
            NotificationOut(
                id=mention.id,
                comment_id=mention.comment_id,
                instance_id=mention.instance_id,
                step_id=mention.step_id,
                instance_title=instance.title,
                step_label=step_label,
                comment_preview=_comment_preview(comment.content),
                author_email=author.email,
                is_read=mention.is_read,
                created_at=mention.created_at,
            )
        )
    return notifications


@notifications_router.post("/{notification_id}/read", status_code=200)
async def mark_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CommentMention).where(
            CommentMention.id == notification_id,
            CommentMention.mentioned_user_id == user.id,
        )
    )
    mention = result.scalar_one_or_none()
    if not mention:
        raise HTTPException(status_code=404, detail="Notification not found")
    mention.is_read = True
    return {"detail": "Marked as read"}


@notifications_router.post("/read-all", status_code=200)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CommentMention).where(
            CommentMention.mentioned_user_id == user.id,
            CommentMention.is_read.is_(False),
        )
    )
    for mention in result.scalars().all():
        mention.is_read = True
    return {"detail": "All notifications marked as read"}
