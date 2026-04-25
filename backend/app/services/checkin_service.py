from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from typing import Optional
from datetime import datetime, timezone
import uuid

from app.models.models import CheckIn, Booking, Room, Guest, BookingStatus, RoomStatus
from fastapi import HTTPException
from pydantic import BaseModel


class CheckInCreate(BaseModel):
    booking_ref: str
    key_card_number: Optional[str] = None
    remarks: Optional[str] = None


class CheckOutData(BaseModel):
    remarks: Optional[str] = None


async def process_checkin(
    db: AsyncSession,
    data: CheckInCreate,
    processed_by: uuid.UUID,
) -> CheckIn:
    # Load booking
    result = await db.execute(
        select(Booking).where(Booking.booking_ref == data.booking_ref)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != BookingStatus.confirmed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot check in — booking status is '{booking.status}'"
        )

    # Check already checked in
    existing = await db.execute(
        select(CheckIn).where(CheckIn.booking_id == booking.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Guest is already checked in")

    # Update booking status
    booking.status = BookingStatus.checked_in

    # Update room status to occupied — load separately
    room_result = await db.execute(
        select(Room).where(Room.id == booking.room_id)
    )
    room = room_result.scalar_one_or_none()
    if room:
        room.status = RoomStatus.occupied

    # Create check-in record
    checkin = CheckIn(
        booking_id=booking.id,
        processed_by=processed_by,
        checkin_time=datetime.now(timezone.utc),
        key_card_number=data.key_card_number,
        remarks=data.remarks,
    )
    db.add(checkin)
    await db.flush()
    await db.refresh(room)
    await db.refresh(booking)
    return checkin


async def process_checkout(
    db: AsyncSession,
    booking_ref: str,
    data: CheckOutData,
    processed_by: uuid.UUID,
) -> CheckIn:
    # Load booking
    result = await db.execute(
        select(Booking).where(Booking.booking_ref == booking_ref)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != BookingStatus.checked_in:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot check out — booking status is '{booking.status}'"
        )

    # Load checkin record
    checkin_result = await db.execute(
        select(CheckIn).where(CheckIn.booking_id == booking.id)
    )
    checkin = checkin_result.scalar_one_or_none()
    if not checkin:
        raise HTTPException(status_code=404, detail="Check-in record not found")

    # Update checkin
    checkin.checkout_time = datetime.now(timezone.utc)
    if data.remarks:
        checkin.remarks = data.remarks

    # Update booking status
    booking.status = BookingStatus.checked_out

    # Update room to cleaning
    room_result = await db.execute(
        select(Room).where(Room.id == booking.room_id)
    )
    room = room_result.scalar_one_or_none()
    if room:
        room.status = RoomStatus.cleaning

    # Increment guest total stays
    guest_result = await db.execute(
        select(Guest).where(Guest.id == booking.guest_id)
    )
    guest = guest_result.scalar_one_or_none()
    if guest:
        guest.total_stays += 1

    # Create housekeeping task for the vacated room
    from app.services.housekeeping_service import create_checkout_task
    await create_checkout_task(db, booking.room_id)

    await db.flush()
    return checkin
