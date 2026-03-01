import uuid
from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class InstanceCreate(BaseModel):
    definition_id: uuid.UUID
    title: str


class StepAssignRequest(BaseModel):
    assigned_to: uuid.UUID


class StepAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    instance_id: uuid.UUID
    step_id: int
    assigned_to: uuid.UUID
    assigned_by: uuid.UUID
    assigned_at: datetime


class InstanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    request_number: int
    definition_id: uuid.UUID
    title: str
    status: str
    current_step_id: Optional[int]
    created_by: uuid.UUID
    created_at: datetime
    completed_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    last_saved_at: Optional[datetime] = None


class InstanceDetail(InstanceOut):
    """Extended view with workflow config + step states."""
    workflow_name: str
    workflow_config: List[Dict]
    assignments: List[StepAssignmentOut] = []
