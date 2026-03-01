import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_admin
from app.models.group import Group, UserGroupMembership
from app.models.user import User
from app.schemas.group import GroupCreate, GroupOut, GroupUpdate, GroupWithMembers, MemberAdd, MemberOut

router = APIRouter()


@router.get("", response_model=list[GroupOut])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(Group).order_by(Group.name))
    return result.scalars().all()


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
async def create_group(
    payload: GroupCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    group = Group(name=payload.name, description=payload.description)
    db.add(group)
    await db.flush()
    await db.refresh(group)
    return group


@router.put("/{group_id}", response_model=GroupOut)
async def update_group(
    group_id: uuid.UUID,
    payload: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(group, field, value)
    await db.flush()
    await db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.delete(group)


@router.get("/{group_id}/members", response_model=list[MemberOut])
async def list_members(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(User, UserGroupMembership)
        .join(UserGroupMembership, User.id == UserGroupMembership.user_id)
        .where(UserGroupMembership.group_id == group_id)
    )
    rows = result.all()
    return [
        MemberOut(user_id=user.id, email=user.email, full_name=user.full_name)
        for user, _ in rows
    ]


@router.post("/{group_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(
    group_id: uuid.UUID,
    payload: MemberAdd,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    # Verify group and user exist
    group_result = await db.execute(select(Group).where(Group.id == group_id))
    if not group_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Group not found")

    user_result = await db.execute(select(User).where(User.id == payload.user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Check for duplicate
    existing = await db.execute(
        select(UserGroupMembership).where(
            UserGroupMembership.group_id == group_id,
            UserGroupMembership.user_id == payload.user_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"detail": "User already in group"}

    membership = UserGroupMembership(group_id=group_id, user_id=payload.user_id)
    db.add(membership)
    return {"detail": "Member added"}


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(UserGroupMembership).where(
            UserGroupMembership.group_id == group_id,
            UserGroupMembership.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    await db.delete(membership)
