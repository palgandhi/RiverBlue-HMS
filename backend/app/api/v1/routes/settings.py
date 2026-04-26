from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
import uuid

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.services.settings_service import get_settings, update_settings, HotelSettingsUpdate

router = APIRouter(prefix="/settings", tags=["Hotel Settings"])


class HotelSettingsResponse(BaseModel):
    id: uuid.UUID
    hotel_name: str
    gstin: Optional[str]
    address_line1: str
    address_line2: Optional[str]
    city: str
    state: str
    state_code: str
    pincode: str
    phone: Optional[str]
    email: Optional[str]
    website: Optional[str]
    checkin_time: str
    checkout_time: str
    currency: str
    updated_at: datetime
    model_config = {"from_attributes": True}


@router.get("/", response_model=HotelSettingsResponse)
async def get_hotel_settings(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await get_settings(db)


@router.patch("/", response_model=HotelSettingsResponse)
async def update_hotel_settings(
    data: HotelSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    return await update_settings(db, data)
