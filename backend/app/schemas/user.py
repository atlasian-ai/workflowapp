import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    role: str = "preparer"


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    supabase_id: uuid.UUID
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime


class UserSyncRequest(BaseModel):
    """Sent from frontend after Supabase signup to register user in local DB."""
    supabase_id: str
    email: EmailStr
    full_name: Optional[str] = None


class UserProfileUpdate(BaseModel):
    """Allows a user to update their own profile."""
    full_name: Optional[str] = None
