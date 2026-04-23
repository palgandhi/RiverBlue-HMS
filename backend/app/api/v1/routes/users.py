from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid

from app.core.database import get_db
from app.core.security import require_roles
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.services.user_service import create_user, get_all_users, get_user_by_email, update_user, get_user_by_id

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("/", response_model=UserResponse, status_code=201)
async def create_staff_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    if await get_user_by_email(db, data.email):
        raise HTTPException(status_code=409, detail="Email already registered")
    return await create_user(db, data)


@router.get("/", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    return await get_all_users(db)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user_route(
    user_id: uuid.UUID,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    user = await get_user_by_id(db, str(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return await update_user(db, user, data)
