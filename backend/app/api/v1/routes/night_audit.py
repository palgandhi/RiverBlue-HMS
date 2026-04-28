from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel
import uuid

from app.core.database import get_db
from app.core.security import require_roles
from app.services.night_audit_service import run_night_audit
from app.models.models import NightAuditLog, DailyStats

router = APIRouter(prefix="/night-audit", tags=["Night Audit"])


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    business_date: date
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    bookings_processed: int
    charges_posted: int
    total_revenue_posted: int
    error_message: Optional[str]
    ran_by: Optional[str]
    model_config = {"from_attributes": True}


class DailyStatsResponse(BaseModel):
    id: uuid.UUID
    business_date: date
    total_rooms: int
    occupied_rooms: int
    available_rooms: int
    occupancy_pct: int
    room_revenue: int
    total_revenue: int
    new_bookings: int
    checkins_count: int
    checkouts_count: int
    no_shows_count: int
    adr: int
    revpar: int
    audit_ran_at: Optional[datetime]
    model_config = {"from_attributes": True}


@router.post("/run")
async def trigger_night_audit(
    business_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    result = await run_night_audit(
        db,
        business_date=business_date,
        ran_by=current_user.email,
    )
    return result


@router.get("/logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    result = await db.execute(
        select(NightAuditLog).order_by(desc(NightAuditLog.business_date)).limit(30)
    )
    return result.scalars().all()


@router.get("/stats", response_model=List[DailyStatsResponse])
async def get_daily_stats(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    result = await db.execute(
        select(DailyStats).order_by(desc(DailyStats.business_date)).limit(days)
    )
    return result.scalars().all()


@router.get("/stats/today", response_model=Optional[DailyStatsResponse])
async def get_today_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    today = date.today()
    result = await db.execute(
        select(DailyStats).where(DailyStats.business_date == today)
    )
    return result.scalar_one_or_none()
