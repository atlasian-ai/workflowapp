import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


# ─── JSON Config types (mirrors the schema spec) ───────────────────────────

class TableColumn(BaseModel):
    col_id: str
    col_label: str
    col_type: str  # textbox | number | calculated
    formula: Optional[str] = None


class FormField(BaseModel):
    field_id: str
    field_label: str
    field_type: str
    required: bool = False
    placeholder: Optional[str] = None
    default: Any = None
    options: Optional[List[str]] = None
    options_source: Optional[str] = None  # inline | list | api
    list_name: Optional[str] = None
    formula: Optional[str] = None
    read_only: bool = False
    accepted_formats: Optional[List[str]] = None
    extract_fields: Optional[Dict[str, str]] = None  # for ocr_reader
    columns: Optional[List[TableColumn]] = None  # for table


class WorkflowStep(BaseModel):
    step_id: int
    step_name: str
    step_label: str
    approvers: List[str] = []
    form_fields: List[FormField] = []


# ─── CRUD schemas ────────────────────────────────────────────────────────────

class WorkflowDefinitionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    config: List[WorkflowStep]


class WorkflowDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[List[WorkflowStep]] = None


class WorkflowDefinitionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: Optional[str]
    config: List[Dict]
    status: str
    created_by: Optional[uuid.UUID]
    created_at: datetime
    published_at: Optional[datetime]
