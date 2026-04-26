from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import HotelSettings
from fastapi import HTTPException
from pydantic import BaseModel
from typing import Optional


class HotelSettingsUpdate(BaseModel):
    hotel_name: Optional[str] = None
    gstin: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    checkin_time: Optional[str] = None
    checkout_time: Optional[str] = None


async def get_settings(db: AsyncSession) -> HotelSettings:
    result = await db.execute(select(HotelSettings))
    settings = result.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Hotel settings not configured")
    return settings


async def update_settings(db: AsyncSession, data: HotelSettingsUpdate) -> HotelSettings:
    settings = await get_settings(db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    await db.flush()
    return settings
