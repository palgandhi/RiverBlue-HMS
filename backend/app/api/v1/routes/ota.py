from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import date, datetime, timezone
from pydantic import BaseModel
import uuid
import hmac
import hashlib
import json

from app.core.database import get_db
from app.core.security import require_roles, get_current_user
from app.services.ota_service import (
    list_rate_plans, create_rate_plan, update_rate_plan,
    list_ota_channels, create_ota_channel, update_ota_channel,
    RatePlanCreate, RatePlanUpdate, OTAChannelCreate, OTAChannelUpdate
)
from app.models.models import (
    RatePlan, OTAChannelConfig, Room, RoomType, Booking,
    BookingStatus, BookingSource, RoomStatus
)
from app.services.booking_service import create_or_get_guest
from app.schemas.booking import GuestCreate

router = APIRouter(prefix="/ota", tags=["OTA & Rate Plans"])


class RatePlanResponse(BaseModel):
    id: uuid.UUID
    room_type_id: uuid.UUID
    name: str
    source: str
    price_per_night: int
    is_active: bool
    valid_from: Optional[date]
    valid_to: Optional[date]
    model_config = {"from_attributes": True}


class OTAChannelResponse(BaseModel):
    id: uuid.UUID
    channel_name: str
    display_name: str
    is_active: bool
    commission_pct: int
    last_synced_at: Optional[datetime]
    api_endpoint: Optional[str]
    model_config = {"from_attributes": True}


class AvailabilityRequest(BaseModel):
    check_in: date
    check_out: date
    adults: int = 1


class AvailabilityResponse(BaseModel):
    room_type_id: str
    room_type_name: str
    available_rooms: int
    rate_per_night: int
    total_rate: int
    max_occupancy: int
    amenities: Optional[dict]


# ── Rate Plans ────────────────────────────────────────────────────────────────

@router.get("/rate-plans", response_model=List[RatePlanResponse])
async def get_rate_plans(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    return await list_rate_plans(db)


@router.post("/rate-plans", response_model=RatePlanResponse, status_code=201)
async def add_rate_plan(
    data: RatePlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    return await create_rate_plan(db, data)


@router.patch("/rate-plans/{plan_id}", response_model=RatePlanResponse)
async def edit_rate_plan(
    plan_id: uuid.UUID,
    data: RatePlanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    return await update_rate_plan(db, plan_id, data)


# ── OTA Channels ──────────────────────────────────────────────────────────────

@router.get("/channels", response_model=List[OTAChannelResponse])
async def get_channels(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    return await list_ota_channels(db)


@router.post("/channels", response_model=OTAChannelResponse, status_code=201)
async def add_channel(
    data: OTAChannelCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    return await create_ota_channel(db, data)


@router.patch("/channels/{channel_id}", response_model=OTAChannelResponse)
async def edit_channel(
    channel_id: uuid.UUID,
    data: OTAChannelUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    return await update_ota_channel(db, channel_id, data)


# ── Availability API (channel manager pulls this) ─────────────────────────────

@router.post("/availability", response_model=List[AvailabilityResponse])
async def check_availability(
    data: AvailabilityRequest,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — channel manager queries this to get available rooms and rates."""
    from sqlalchemy import and_, or_, func
    nights = (data.check_out - data.check_in).days
    if nights <= 0:
        raise HTTPException(status_code=422, detail="Check-out must be after check-in")

    # Get all room types
    rt_result = await db.execute(select(RoomType).where(RoomType.total_rooms > 0))
    room_types = rt_result.scalars().all()

    results = []
    for rt in room_types:
        if rt.max_occupancy < data.adults:
            continue

        # Count available rooms of this type
        total_rooms_result = await db.execute(
            select(func.count()).select_from(Room).where(
                Room.room_type_id == rt.id,
                Room.status == RoomStatus.available,
            )
        )
        total_rooms = total_rooms_result.scalar() or 0

        # Count rooms already booked for these dates
        booked_result = await db.execute(
            select(func.count()).select_from(Booking).join(
                Room, Booking.room_id == Room.id
            ).where(
                Room.room_type_id == rt.id,
                Booking.status.not_in([BookingStatus.cancelled, BookingStatus.no_show]),
                or_(
                    and_(Booking.check_in_date <= data.check_in, Booking.check_out_date > data.check_in),
                    and_(Booking.check_in_date < data.check_out, Booking.check_out_date >= data.check_out),
                    and_(Booking.check_in_date >= data.check_in, Booking.check_out_date <= data.check_out),
                )
            )
        )
        booked = booked_result.scalar() or 0
        available = total_rooms - booked

        if available <= 0:
            continue

        results.append(AvailabilityResponse(
            room_type_id=str(rt.id),
            room_type_name=rt.name,
            available_rooms=available,
            rate_per_night=rt.base_price_per_night,
            total_rate=rt.base_price_per_night * nights,
            max_occupancy=rt.max_occupancy,
            amenities=rt.amenities,
        ))

    return results


# ── Inbound Webhook (channel manager pushes bookings here) ───────────────────

@router.post("/webhook/inbound")
async def inbound_booking_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Generic inbound webhook for channel manager.
    Channel manager sends bookings here.
    Payload format:
    {
        "channel": "rezNext",
        "booking_id": "RN-123456",
        "guest": {"name": "...", "email": "...", "phone": "..."},
        "room_type_id": "uuid",
        "check_in": "2026-05-01",
        "check_out": "2026-05-03",
        "adults": 2,
        "children": 0,
        "total_amount": 600000,
        "source": "makemytrip",
        "signature": "hmac_sha256_signature"
    }
    """
    body = await request.body()
    payload = json.loads(body)

    channel_name = payload.get("channel", "").lower()

    # Verify HMAC signature if channel is configured
    channel_result = await db.execute(
        select(OTAChannelConfig).where(
            OTAChannelConfig.channel_name == channel_name,
            OTAChannelConfig.is_active == True,
        )
    )
    channel = channel_result.scalar_one_or_none()

    if channel and channel.webhook_secret:
        signature = request.headers.get("X-Signature", "")
        expected = hmac.new(
            channel.webhook_secret.encode(),
            body,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    # Find an available room of the requested type
    room_type_id = uuid.UUID(payload["room_type_id"])
    check_in = date.fromisoformat(payload["check_in"])
    check_out = date.fromisoformat(payload["check_out"])

    # Get available room
    rooms_result = await db.execute(
        select(Room).where(
            Room.room_type_id == room_type_id,
            Room.status == RoomStatus.available,
        ).limit(1)
    )
    room = rooms_result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=409, detail="No rooms available for requested type and dates")

    # Create or get guest
    guest_data = payload.get("guest", {})
    guest = await create_or_get_guest(db, GuestCreate(
        full_name=guest_data.get("name", "OTA Guest"),
        email=guest_data.get("email"),
        phone=guest_data.get("phone", "0000000000"),
    ))

    # Get system user
    from app.models.models import User
    sys_result = await db.execute(
        select(User).where(User.email == "system@riverblue.com")
    )
    system_user = sys_result.scalar_one_or_none()
    if not system_user:
        raise HTTPException(status_code=500, detail="System user not configured")

    # Create booking
    from app.services.booking_service import create_booking
    from app.schemas.booking import BookingCreate

    # Map source
    source_map = {
        "makemytrip": BookingSource.makemytrip,
        "ixigo": BookingSource.ixigo,
        "booking_com": BookingSource.booking_com,
        "expedia": BookingSource.expedia,
    }
    source = source_map.get(payload.get("source", "").lower(), BookingSource.other)

    booking = await create_booking(db, BookingCreate(
        guest_id=guest.id,
        room_id=room.id,
        check_in_date=check_in,
        check_out_date=check_out,
        num_adults=payload.get("adults", 1),
        num_children=payload.get("children", 0),
        source=source,
        ota_booking_id=payload.get("booking_id"),
        ota_channel=channel_name,
    ), system_user.id)

    # Update last synced
    if channel:
        channel.last_synced_at = datetime.now(timezone.utc)

    await db.flush()

    return {
        "status": "accepted",
        "booking_ref": booking.booking_ref,
        "room": room.room_number,
        "total_amount": booking.total_amount,
    }
