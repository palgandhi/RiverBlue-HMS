from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

from app.core.database import get_db
from app.core.security import require_roles, get_current_user
from app.services.checkin_service import process_checkin, process_checkout, CheckInCreate, CheckOutData

router = APIRouter(prefix="/checkins", tags=["Check-in / Check-out"])


class CheckInResponse(BaseModel):
    id: uuid.UUID
    booking_id: uuid.UUID
    processed_by: uuid.UUID
    checkin_time: datetime
    checkout_time: Optional[datetime]
    key_card_number: Optional[str]
    remarks: Optional[str]

    model_config = {"from_attributes": True}


@router.post("/", response_model=CheckInResponse, status_code=201)
async def checkin(
    data: CheckInCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    return await process_checkin(db, data, current_user.id)


@router.post("/{booking_ref}/checkout", response_model=CheckInResponse)
async def checkout(
    booking_ref: str,
    data: CheckOutData,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    return await process_checkout(db, booking_ref, data, current_user.id)
