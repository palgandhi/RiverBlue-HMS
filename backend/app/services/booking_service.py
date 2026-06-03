from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import joinedload
from typing import Optional
from datetime import date
import uuid, random, string

from app.models.models import Booking, Room, Guest, BookingStatus
from app.schemas.booking import BookingCreate, BookingUpdate, GuestCreate
from fastapi import HTTPException


def _generate_booking_ref() -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"RB-{suffix}"


async def check_room_availability(
    db: AsyncSession,
    room_id: uuid.UUID,
    check_in: date,
    check_out: date,
    exclude_booking_id: Optional[uuid.UUID] = None,
) -> bool:
    query = select(Booking).where(
        and_(
            Booking.room_id == room_id,
            Booking.status.not_in([BookingStatus.cancelled, BookingStatus.no_show]),
            or_(
                and_(Booking.check_in_date <= check_in, Booking.check_out_date > check_in),
                and_(Booking.check_in_date < check_out, Booking.check_out_date >= check_out),
                and_(Booking.check_in_date >= check_in, Booking.check_out_date <= check_out),
            ),
        )
    )
    if exclude_booking_id:
        query = query.where(Booking.id != exclude_booking_id)
    result = await db.execute(query)
    return result.scalar_one_or_none() is None


async def create_booking(
    db: AsyncSession,
    data: BookingCreate,
    created_by: uuid.UUID,
) -> Booking:
    available = await check_room_availability(db, data.room_id, data.check_in_date, data.check_out_date)
    if not available:
        raise HTTPException(status_code=409, detail="Room not available for selected dates")

    # Eagerly load room_type to avoid lazy load in async context
    result = await db.execute(
        select(Room).options(joinedload(Room.room_type)).where(Room.id == data.room_id)
    )
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    nights = (data.check_out_date - data.check_in_date).days
    total = room.room_type.base_price_per_night * nights

    ref = _generate_booking_ref()
    while True:
        existing = await db.execute(select(Booking).where(Booking.booking_ref == ref))
        if not existing.scalar_one_or_none():
            break
        ref = _generate_booking_ref()

    booking = Booking(
        guest_id=data.guest_id,
        room_id=data.room_id,
        created_by=created_by,
        booking_ref=ref,
        check_in_date=data.check_in_date,
        check_out_date=data.check_out_date,
        num_adults=data.num_adults,
        num_children=data.num_children,
        status=BookingStatus.confirmed,
        source=data.source,
        ota_booking_id=data.ota_booking_id,
        ota_channel=data.ota_channel,
        total_amount=total,
        special_requests=data.special_requests,
    )
    db.add(booking)
    await db.flush()

    from app.services.audit_log_service import log_action
    await log_action(
        db,
        action="create_booking",
        entity_type="Booking",
        entity_id=str(booking.id),
        new_value={
            "booking_ref": booking.booking_ref,
            "room_id": str(booking.room_id),
            "guest_id": str(booking.guest_id),
            "check_in_date": str(booking.check_in_date),
            "check_out_date": str(booking.check_out_date),
            "total_amount": booking.total_amount,
            "source": booking.source,
        }
    )

    # Push availability update to channel managers (fire-and-forget)
    from app.services.channel_push_service import push_availability_update
    import asyncio
    asyncio.create_task(
        push_availability_update(
            db, room.room_type_id,
            data.check_in_date, data.check_out_date,
            triggered_by="booking_created"
        )
    )
    return booking


async def get_booking_by_ref(db: AsyncSession, ref: str) -> Optional[Booking]:
    result = await db.execute(select(Booking).where(Booking.booking_ref == ref))
    return result.scalar_one_or_none()


async def update_booking(db: AsyncSession, booking: Booking, data: BookingUpdate) -> Booking:
    old_val = {
        "room_id": str(booking.room_id),
        "check_in_date": str(booking.check_in_date),
        "check_out_date": str(booking.check_out_date),
        "num_adults": booking.num_adults,
        "num_children": booking.num_children,
        "status": booking.status,
    }
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(booking, field, value)
    await db.flush()

    new_val = {
        "room_id": str(booking.room_id),
        "check_in_date": str(booking.check_in_date),
        "check_out_date": str(booking.check_out_date),
        "num_adults": booking.num_adults,
        "num_children": booking.num_children,
        "status": booking.status,
    }

    from app.services.audit_log_service import log_action
    await log_action(
        db,
        action="update_booking",
        entity_type="Booking",
        entity_id=str(booking.id),
        old_value=old_val,
        new_value=new_val
    )

    # If status changed to cancelled/no_show, free up inventory on OTAs
    new_status = new_val.get("status")
    if new_status in ("cancelled", "no_show"):
        from app.services.channel_push_service import push_availability_update
        from app.models.models import Room as RoomModel, RoomType as RoomTypeModel
        import asyncio
        room_res = await db.execute(select(RoomModel).where(RoomModel.id == booking.room_id))
        room_obj = room_res.scalar_one_or_none()
        if room_obj:
            asyncio.create_task(
                push_availability_update(
                    db, room_obj.room_type_id,
                    booking.check_in_date, booking.check_out_date,
                    triggered_by=f"booking_{new_status}"
                )
            )
    return booking


async def create_or_get_guest(db: AsyncSession, data: GuestCreate) -> Guest:
    if data.email:
        result = await db.execute(select(Guest).where(Guest.email == data.email))
        existing = result.scalar_one_or_none()
        if existing:
            return existing
    guest = Guest(**data.model_dump())
    db.add(guest)
    await db.flush()
    return guest
