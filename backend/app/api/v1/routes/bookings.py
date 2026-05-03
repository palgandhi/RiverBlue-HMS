from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import uuid

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.models import Booking
from app.schemas.booking import BookingCreate, BookingUpdate, BookingResponse, GuestCreate, GuestResponse
from app.services.booking_service import create_booking, get_booking_by_ref, update_booking, create_or_get_guest

router = APIRouter(prefix="/bookings", tags=["Bookings"])


@router.get("/guests/search", response_model=List[GuestResponse])
async def search_guests(
    q: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from sqlalchemy import or_
    from app.models.models import Guest
    result = await db.execute(
        select(Guest).where(
            or_(
                Guest.full_name.ilike(f"%{q}%"),
                Guest.phone.ilike(f"%{q}%"),
                Guest.email.ilike(f"%{q}%"),
            )
        ).limit(10)
    )
    return result.scalars().all()


@router.post("/guests", response_model=GuestResponse, status_code=201)
async def create_guest(
    data: GuestCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    return await create_or_get_guest(db, data)


@router.post("/", response_model=BookingResponse, status_code=201)
async def create_new_booking(
    data: BookingCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    return await create_booking(db, data, current_user.id)


@router.get("/", response_model=List[BookingResponse])
async def list_bookings(
    status: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = select(Booking).offset(skip).limit(limit).order_by(Booking.created_at.desc())
    if status:
        query = query.where(Booking.status == status)
    if source:
        query = query.where(Booking.source == source)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{booking_ref}", response_model=BookingResponse)
async def get_booking(
    booking_ref: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    booking = await get_booking_by_ref(db, booking_ref)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@router.patch("/{booking_ref}", response_model=BookingResponse)
async def update_booking_route(
    booking_ref: str,
    data: BookingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    booking = await get_booking_by_ref(db, booking_ref)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return await update_booking(db, booking, data)


@router.post("/{booking_ref}/cancel", response_model=BookingResponse)
async def cancel_booking(
    booking_ref: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    from app.models.models import BookingStatus, RoomStatus, Room
    booking = await get_booking_by_ref(db, booking_ref)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status not in [BookingStatus.confirmed]:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel a booking with status '{booking.status}'"
        )
    booking.status = BookingStatus.cancelled
    # Free up the room
    result = await db.execute(select(Room).where(Room.id == booking.room_id))
    room = result.scalar_one_or_none()
    if room and room.status == RoomStatus.occupied:
        room.status = RoomStatus.available
    await db.flush()
    return booking


@router.post("/{booking_ref}/no-show", response_model=BookingResponse)
async def mark_no_show(
    booking_ref: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    from app.models.models import BookingStatus
    booking = await get_booking_by_ref(db, booking_ref)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != BookingStatus.confirmed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot mark no-show for booking with status '{booking.status}'"
        )
    booking.status = BookingStatus.no_show
    await db.flush()
    return booking
