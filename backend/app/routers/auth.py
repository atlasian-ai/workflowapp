"""
Auth router — syncs a Supabase user into the local users table.

Called once by the frontend after the user signs up/signs in via Supabase.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserOut, UserSyncRequest, UserProfileUpdate

router = APIRouter()


@router.post("/sync", response_model=UserOut)
async def sync_user(payload: UserSyncRequest, db: AsyncSession = Depends(get_db)):
    """
    Called after Supabase auth to register the user in the local DB.
    Idempotent — safe to call multiple times.
    """
    result = await db.execute(
        select(User).where(User.supabase_id == uuid.UUID(payload.supabase_id))
    )
    user = result.scalar_one_or_none()

    if user:
        # Update name if changed
        if payload.full_name and user.full_name != payload.full_name:
            user.full_name = payload.full_name
        return user

    # First time — create the user
    # First user is auto-admin (bootstrap)
    count_result = await db.execute(select(User))
    is_first = len(count_result.scalars().all()) == 0

    user = User(
        supabase_id=uuid.UUID(payload.supabase_id),
        email=payload.email,
        full_name=payload.full_name,
        role="admin" if is_first else "preparer",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/profile", response_model=UserOut)
async def update_profile(
    payload: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the authenticated user's own profile fields."""
    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip() or None
    await db.flush()
    await db.refresh(current_user)
    return current_user
