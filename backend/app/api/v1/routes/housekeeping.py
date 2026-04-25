from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
import uuid

from app.core.database import get_db
from app.core.security import require_roles, get_current_user
from app.services.housekeeping_service import (
    get_tasks, create_task, update_task, TaskCreate, TaskUpdate
)
from app.models.models import HousekeepingTask
from pydantic import BaseModel


class TaskResponse(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    assigned_to: Optional[uuid.UUID]
    task_type: str
    priority: str
    status: str
    notes: Optional[str]
    scheduled_at: Optional[datetime]
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


router = APIRouter(prefix="/housekeeping", tags=["Housekeeping"])


@router.get("/tasks", response_model=List[TaskResponse])
async def list_tasks(
    status: Optional[str] = Query(None),
    assigned_to: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "housekeeping", "receptionist")),
):
    return await get_tasks(db, status=status, assigned_to=assigned_to)


@router.post("/tasks", response_model=TaskResponse, status_code=201)
async def create_new_task(
    data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    return await create_task(db, data)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task_route(
    task_id: uuid.UUID,
    data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "housekeeping", "receptionist")),
):
    return await update_task(db, task_id, data, current_user.id)
