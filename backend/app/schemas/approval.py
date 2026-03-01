import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ApprovalDecision(BaseModel):
    decision: str  # approved | rejected
    comment: Optional[str] = None


class ApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    instance_id: uuid.UUID
    step_id: int
    approver_id: uuid.UUID
    approver_email: Optional[str] = None  # enriched by the endpoint
    decision: Optional[str]
    comment: Optional[str]
    decided_at: Optional[datetime]
    created_at: datetime


class PendingApprovalOut(ApprovalOut):
    """Enriched with context for the approver's queue."""
    instance_title: str
    workflow_name: str
    step_label: str
    submitted_by_email: str
