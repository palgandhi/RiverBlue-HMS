from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import HotelSettings
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
        # Auto-create a default row on first access
        settings = HotelSettings(
            hotel_name="RiverBlue Hotel",
            address_line1="Hotel Address",
            city="City",
            state="State",
            state_code="ST",
            pincode="000000",
        )
        db.add(settings)
        await db.flush()
    return settings


async def update_settings(db: AsyncSession, data: HotelSettingsUpdate) -> HotelSettings:
    result = await db.execute(select(HotelSettings))
    settings = result.scalar_one_or_none()

    if not settings:
        # First-time setup — create the row from the incoming data
        payload = data.model_dump(exclude_unset=True)
        settings = HotelSettings(**payload)
        db.add(settings)
        await db.flush()
    else:
        old_val = {
            field: getattr(settings, field)
            for field in data.model_dump(exclude_unset=True).keys()
        }
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(settings, field, value)
        await db.flush()

        new_val = {
            field: getattr(settings, field)
            for field in data.model_dump(exclude_unset=True).keys()
        }

        from app.services.audit_log_service import log_action
        await log_action(
            db,
            action="update_settings",
            entity_type="HotelSettings",
            entity_id=str(settings.id),
            old_value=old_val,
            new_value=new_val
        )
    return settings
