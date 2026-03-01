import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReferenceOption(BaseModel):
    label: str
    value: str


class ReferenceListCreate(BaseModel):
    list_name: str
    options: list[ReferenceOption]


class ReferenceListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    list_name: str
    options: list[dict]
    created_at: datetime
