import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict


class SubmissionSave(BaseModel):
    """Save a draft (partial data OK)."""
    form_data: Dict[str, Any]


class SubmissionSubmit(BaseModel):
    """Final submission — triggers approval flow."""
    form_data: Dict[str, Any]


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    instance_id: uuid.UUID
    step_id: int
    submitted_by: uuid.UUID
    form_data: Dict[str, Any]
    status: str
    submitted_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
