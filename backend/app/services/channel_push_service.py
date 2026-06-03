"""
channel_push_service.py
Outbound sync: pushes availability & rate updates to channel managers.

Flow:
  Any booking / cancellation / rate change
        ↓
  push_availability_update()  OR  push_rate_update()
        ↓
  HTTP POST to channel.api_endpoint   (generic channel-manager API contract)
        ↓
  Result stored in ota_push_logs for visibility

Channel manager API contract (what we POST):
  Availability update:
    POST {api_endpoint}/availability
    Headers: X-Api-Key: {api_key}
    Body: {
      "hotel_id": "...",
      "room_type_id": "...",
      "room_type_name": "...",
      "date_from": "YYYY-MM-DD",
      "date_to": "YYYY-MM-DD",
      "available_rooms": 5,
      "stop_sell": false
    }

  Rate update:
    POST {api_endpoint}/rates
    Headers: X-Api-Key: {api_key}
    Body: {
      "hotel_id": "...",
      "room_type_id": "...",
      "source": "makemytrip",
      "rate_per_night": 500000,  # paise
      "valid_from": "YYYY-MM-DD",
      "valid_to": "YYYY-MM-DD"
    }

This is a generic contract that works with ezee, RezNext, Staah etc. after
you configure their push endpoint URL + API key in OTAChannelConfig.
"""

import asyncio
import logging
from datetime import date, datetime, timezone, timedelta
from typing import Optional, List
import uuid
import httpx

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.models.models import (
    OTAChannelConfig, RatePlan, RoomType, Room,
    Booking, BookingStatus, RoomStatus, OTAPushLog,
    HotelSettings
)

logger = logging.getLogger(__name__)

# Push timeout — don't let a slow channel manager block our request
PUSH_TIMEOUT_SECONDS = 8


async def _get_hotel_id(db: AsyncSession) -> str:
    """Get hotel identifier from settings (used as hotel_id in payloads)."""
    result = await db.execute(select(HotelSettings).limit(1))
    settings = result.scalar_one_or_none()
    if settings:
        return settings.hotel_name.lower().replace(" ", "_")
    return "riverblue_hotel"


async def _count_available_rooms(
    db: AsyncSession,
    room_type_id: uuid.UUID,
    check_in: date,
    check_out: date,
) -> int:
    """Count physically available rooms of a type for a date range."""
    total_result = await db.execute(
        select(func.count()).select_from(Room).where(
            Room.room_type_id == room_type_id,
            Room.status.in_([RoomStatus.available, RoomStatus.occupied]),
        )
    )
    total = total_result.scalar() or 0

    booked_result = await db.execute(
        select(func.count()).select_from(Booking).join(
            Room, Booking.room_id == Room.id
        ).where(
            Room.room_type_id == room_type_id,
            Booking.status.not_in([BookingStatus.cancelled, BookingStatus.no_show]),
            or_(
                and_(Booking.check_in_date <= check_in, Booking.check_out_date > check_in),
                and_(Booking.check_in_date < check_out, Booking.check_out_date >= check_out),
                and_(Booking.check_in_date >= check_in, Booking.check_out_date <= check_out),
            )
        )
    )
    booked = booked_result.scalar() or 0
    return max(0, total - booked)


async def _post_to_channel(
    channel: OTAChannelConfig,
    path: str,
    payload: dict,
) -> tuple[bool, str]:
    """Fire an HTTP POST to the channel manager. Returns (success, message)."""
    if not channel.api_endpoint or not channel.api_key:
        return False, "No api_endpoint or api_key configured"

    url = channel.api_endpoint.rstrip("/") + path
    headers = {
        "X-Api-Key": channel.api_key,
        "Content-Type": "application/json",
        "X-Source": "RiverBlue-HMS",
    }

    try:
        async with httpx.AsyncClient(timeout=PUSH_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code in (200, 201, 202, 204):
                return True, f"HTTP {resp.status_code}"
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
    except httpx.TimeoutException:
        return False, "Request timed out"
    except httpx.ConnectError as e:
        return False, f"Connection error: {str(e)[:100]}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)[:100]}"


async def _log_push(
    db: AsyncSession,
    channel_id: uuid.UUID,
    push_type: str,
    payload: dict,
    success: bool,
    response_message: str,
    room_type_id: Optional[uuid.UUID] = None,
) -> None:
    """Persist push attempt to ota_push_logs for visibility."""
    log = OTAPushLog(
        channel_id=channel_id,
        room_type_id=room_type_id,
        push_type=push_type,
        payload=payload,
        success=success,
        response_message=response_message,
    )
    db.add(log)
    # intentionally no flush here — caller controls transaction


async def push_availability_update(
    db: AsyncSession,
    room_type_id: uuid.UUID,
    from_date: date,
    to_date: date,
    triggered_by: str = "system",
) -> None:
    """
    Push updated availability for a room type across a date window
    to all active, configured channel managers.

    Called after:
      - A booking is created (direct, walk-in)
      - A booking is cancelled / marked no-show
      - A room is put in/out of maintenance
    """
    # Load all active channels that have an endpoint configured
    channels_result = await db.execute(
        select(OTAChannelConfig).where(
            OTAChannelConfig.is_active == True,
            OTAChannelConfig.api_endpoint != None,
            OTAChannelConfig.api_key != None,
        )
    )
    channels: List[OTAChannelConfig] = channels_result.scalars().all()
    if not channels:
        return

    # Load room type info
    rt_result = await db.execute(select(RoomType).where(RoomType.id == room_type_id))
    room_type = rt_result.scalar_one_or_none()
    if not room_type:
        return

    hotel_id = await _get_hotel_id(db)
    available = await _count_available_rooms(db, room_type_id, from_date, to_date)
    stop_sell = available == 0

    payload = {
        "hotel_id": hotel_id,
        "room_type_id": str(room_type_id),
        "room_type_name": room_type.name,
        "date_from": from_date.isoformat(),
        "date_to": to_date.isoformat(),
        "available_rooms": available,
        "stop_sell": stop_sell,
        "triggered_by": triggered_by,
        "pushed_at": datetime.now(timezone.utc).isoformat(),
    }

    # Fire all channel pushes concurrently
    async def push_one(channel: OTAChannelConfig):
        success, message = await _post_to_channel(channel, "/availability", payload)
        if success:
            channel.last_synced_at = datetime.now(timezone.utc)
            logger.info(f"[OTA] Availability pushed to {channel.channel_name}: {available} rooms available")
        else:
            logger.warning(f"[OTA] Failed to push availability to {channel.channel_name}: {message}")
        await _log_push(
            db, channel.id, "availability", payload,
            success, message, room_type_id
        )

    await asyncio.gather(*[push_one(ch) for ch in channels], return_exceptions=True)


async def push_rate_update(
    db: AsyncSession,
    rate_plan_id: uuid.UUID,
) -> None:
    """
    Push a rate change to all active channel managers.
    Called whenever a rate plan is created or updated.
    """
    plan_result = await db.execute(
        select(RatePlan).where(RatePlan.id == rate_plan_id)
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return

    channels_result = await db.execute(
        select(OTAChannelConfig).where(
            OTAChannelConfig.is_active == True,
            OTAChannelConfig.api_endpoint != None,
            OTAChannelConfig.api_key != None,
        )
    )
    channels: List[OTAChannelConfig] = channels_result.scalars().all()
    if not channels:
        return

    hotel_id = await _get_hotel_id(db)

    payload = {
        "hotel_id": hotel_id,
        "room_type_id": str(plan.room_type_id),
        "source": plan.source,
        "rate_plan_name": plan.name,
        "rate_per_night": plan.price_per_night,
        "valid_from": plan.valid_from.isoformat() if plan.valid_from else None,
        "valid_to": plan.valid_to.isoformat() if plan.valid_to else None,
        "is_active": plan.is_active,
        "pushed_at": datetime.now(timezone.utc).isoformat(),
    }

    async def push_one(channel: OTAChannelConfig):
        success, message = await _post_to_channel(channel, "/rates", payload)
        if success:
            channel.last_synced_at = datetime.now(timezone.utc)
            logger.info(f"[OTA] Rate pushed to {channel.channel_name}")
        else:
            logger.warning(f"[OTA] Failed rate push to {channel.channel_name}: {message}")
        await _log_push(
            db, channel.id, "rate", payload,
            success, message, plan.room_type_id
        )

    await asyncio.gather(*[push_one(ch) for ch in channels], return_exceptions=True)


async def push_full_sync(db: AsyncSession) -> dict:
    """
    Manual full sync — pushes availability for ALL room types
    for the next 90 days, and all active rate plans.
    Called from the admin dashboard "Sync Now" button.
    """
    today = date.today()
    sync_to = today + timedelta(days=90)

    # Get all room types
    rt_result = await db.execute(select(RoomType).where(RoomType.total_rooms > 0))
    room_types = rt_result.scalars().all()

    availability_pushed = 0
    for rt in room_types:
        await push_availability_update(db, rt.id, today, sync_to, triggered_by="manual_sync")
        availability_pushed += 1

    # Push all active rate plans
    plans_result = await db.execute(
        select(RatePlan).where(RatePlan.is_active == True)
    )
    plans = plans_result.scalars().all()
    rates_pushed = 0
    for plan in plans:
        await push_rate_update(db, plan.id)
        rates_pushed += 1

    return {
        "room_types_synced": availability_pushed,
        "rate_plans_pushed": rates_pushed,
        "sync_window": f"{today.isoformat()} → {sync_to.isoformat()}",
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }
