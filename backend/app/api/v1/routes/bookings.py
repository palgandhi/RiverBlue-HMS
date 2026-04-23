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
