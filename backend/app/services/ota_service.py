from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Optional
from datetime import date
import uuid

from app.models.models import RatePlan, RoomType, OTAChannelConfig
from fastapi import HTTPException
from pydantic import BaseModel


class RatePlanCreate(BaseModel):
    room_type_id: uuid.UUID
    name: str
    source: str
    price_per_night: int  # paise
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None


class RatePlanUpdate(BaseModel):
    price_per_night: Optional[int] = None
    is_active: Optional[bool] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None


class OTAChannelCreate(BaseModel):
    channel_name: str
    display_name: str
    webhook_secret: Optional[str] = None
    api_key: Optional[str] = None
    api_endpoint: Optional[str] = None
    commission_pct: int = 0


class OTAChannelUpdate(BaseModel):
    display_name: Optional[str] = None
    webhook_secret: Optional[str] = None
    api_key: Optional[str] = None
    api_endpoint: Optional[str] = None
    is_active: Optional[bool] = None
    commission_pct: Optional[int] = None


async def get_rate_for_source(
    db: AsyncSession,
    room_type_id: uuid.UUID,
    source: str,
    check_in: Optional[date] = None,
) -> Optional[int]:
    """Get the applicable rate for a room type and source."""
    query = select(RatePlan).where(
        RatePlan.room_type_id == room_type_id,
        RatePlan.source == source,
        RatePlan.is_active == True,
    )
    if check_in:
        query = query.where(
            (RatePlan.valid_from == None) | (RatePlan.valid_from <= check_in),
            (RatePlan.valid_to == None) | (RatePlan.valid_to >= check_in),
        )
    result = await db.execute(query.limit(1))
    plan = result.scalar_one_or_none()
    if plan:
        return plan.price_per_night
    # Fall back to base rate
    rt_result = await db.execute(select(RoomType).where(RoomType.id == room_type_id))
    rt = rt_result.scalar_one_or_none()
    return rt.base_price_per_night if rt else None


async def list_rate_plans(db: AsyncSession) -> List[RatePlan]:
    result = await db.execute(select(RatePlan).order_by(RatePlan.source, RatePlan.name))
    return result.scalars().all()


async def create_rate_plan(db: AsyncSession, data: RatePlanCreate) -> RatePlan:
    plan = RatePlan(**data.model_dump())
    db.add(plan)
    await db.flush()
    return plan


async def update_rate_plan(db: AsyncSession, plan_id: uuid.UUID, data: RatePlanUpdate) -> RatePlan:
    result = await db.execute(select(RatePlan).where(RatePlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Rate plan not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    await db.flush()
    return plan


async def list_ota_channels(db: AsyncSession) -> List[OTAChannelConfig]:
    result = await db.execute(select(OTAChannelConfig).order_by(OTAChannelConfig.channel_name))
    return result.scalars().all()


async def create_ota_channel(db: AsyncSession, data: OTAChannelCreate) -> OTAChannelConfig:
    channel = OTAChannelConfig(**data.model_dump())
    db.add(channel)
    await db.flush()
    return channel


async def update_ota_channel(db: AsyncSession, channel_id: uuid.UUID, data: OTAChannelUpdate) -> OTAChannelConfig:
    result = await db.execute(select(OTAChannelConfig).where(OTAChannelConfig.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(channel, field, value)
    await db.flush()
    return channel
