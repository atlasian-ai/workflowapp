import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class CommentCreate(BaseModel):
    content: str
    # Frontend sends the list of user IDs it resolved from @mentions in the text
    mentioned_user_ids: List[uuid.UUID] = []


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    instance_id: uuid.UUID
    step_id: int
    author_id: uuid.UUID
    author_email: str
    author_name: Optional[str]
    content: str
    created_at: datetime


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    comment_id: uuid.UUID
    instance_id: uuid.UUID
    step_id: int
    # Enriched fields
    instance_title: str
    step_label: str
    comment_preview: str   # first 120 chars of comment content
    author_email: str      # who wrote the comment
    is_read: bool
    created_at: datetime


class UnreadCountOut(BaseModel):
    count: int
