from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
import uuid

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.models import Room, RoomType, RoomStatus

router = APIRouter(prefix="/rooms", tags=["Rooms"])


class RoomTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    base_price_per_night: int
    max_occupancy: int
    total_rooms: int
    amenities: Optional[dict] = None


class RoomCreate(BaseModel):
    room_type_id: uuid.UUID
    room_number: str
    floor: int
    notes: Optional[str] = None


class RoomStatusUpdate(BaseModel):
    status: RoomStatus
    notes: Optional[str] = None


@router.get("/types", response_model=List[dict])
async def list_room_types(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(RoomType).order_by(RoomType.name))
    return [{"id": str(t.id), "name": t.name, "base_price_per_night": t.base_price_per_night, "max_occupancy": t.max_occupancy, "total_rooms": t.total_rooms, "amenities": t.amenities} for t in result.scalars().all()]


@router.post("/types", status_code=201)
async def create_room_type(
    data: RoomTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    rt = RoomType(**data.model_dump())
    db.add(rt)
    await db.flush()
    return {"id": str(rt.id), "name": rt.name}


@router.get("/", response_model=List[dict])
async def list_rooms(
    status: Optional[str] = Query(None),
    floor: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = select(Room).order_by(Room.room_number)
    if status:
        query = query.where(Room.status == status)
    if floor:
        query = query.where(Room.floor == floor)
    result = await db.execute(query)
    return [{"id": str(r.id), "room_number": r.room_number, "floor": r.floor, "status": r.status, "notes": r.notes, "room_type_id": str(r.room_type_id)} for r in result.scalars().all()]


@router.post("/", status_code=201)
async def create_room(
    data: RoomCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    room = Room(**data.model_dump())
    db.add(room)
    await db.flush()
    return {"id": str(room.id), "room_number": room.room_number, "status": room.status}


@router.patch("/{room_id}/status")
async def update_room_status(
    room_id: uuid.UUID,
    data: RoomStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist", "housekeeping")),
):
    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    room.status = data.status
    if data.notes:
        room.notes = data.notes
    await db.flush()
    return {"id": str(room.id), "status": room.status}
