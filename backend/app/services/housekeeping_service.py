from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from app.models.models import HousekeepingTask, Room, HousekeepingTaskType, TaskStatus, TaskPriority, RoomStatus
from fastapi import HTTPException
from pydantic import BaseModel


class TaskCreate(BaseModel):
    room_id: uuid.UUID
    task_type: HousekeepingTaskType
    priority: TaskPriority = TaskPriority.normal
    notes: Optional[str] = None
    assigned_to: Optional[uuid.UUID] = None


class TaskUpdate(BaseModel):
    status: Optional[TaskStatus] = None
    assigned_to: Optional[uuid.UUID] = None
    notes: Optional[str] = None


async def get_tasks(
    db: AsyncSession,
    status: Optional[str] = None,
    assigned_to: Optional[uuid.UUID] = None,
) -> List[HousekeepingTask]:
    query = select(HousekeepingTask).order_by(
        HousekeepingTask.priority.desc(),
        HousekeepingTask.scheduled_at.asc()
    )
    if status:
        query = query.where(HousekeepingTask.status == status)
    if assigned_to:
        query = query.where(HousekeepingTask.assigned_to == assigned_to)
    result = await db.execute(query)
    return result.scalars().all()


async def create_task(db: AsyncSession, data: TaskCreate) -> HousekeepingTask:
    task = HousekeepingTask(
        room_id=data.room_id,
        task_type=data.task_type,
        priority=data.priority,
        notes=data.notes,
        assigned_to=data.assigned_to,
        status=TaskStatus.pending,
        scheduled_at=datetime.now(timezone.utc),
    )
    db.add(task)
    await db.flush()
    return task


async def update_task(
    db: AsyncSession,
    task_id: uuid.UUID,
    data: TaskUpdate,
    current_user_id: uuid.UUID,
) -> HousekeepingTask:
    result = await db.execute(select(HousekeepingTask).where(HousekeepingTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if data.status:
        task.status = data.status
        if data.status == TaskStatus.in_progress and not task.assigned_to:
            task.assigned_to = current_user_id
        if data.status == TaskStatus.completed:
            task.completed_at = datetime.now(timezone.utc)
            # Auto-mark room as available if checkout cleaning completed
            if task.task_type == HousekeepingTaskType.checkout_cleaning:
                room_result = await db.execute(select(Room).where(Room.id == task.room_id))
                room = room_result.scalar_one_or_none()
                if room:
                    room.status = RoomStatus.available

    if data.assigned_to is not None:
        task.assigned_to = data.assigned_to
    if data.notes is not None:
        task.notes = data.notes

    await db.flush()
    return task


async def create_checkout_task(db: AsyncSession, room_id: uuid.UUID) -> HousekeepingTask:
    task = HousekeepingTask(
        room_id=room_id,
        task_type=HousekeepingTaskType.checkout_cleaning,
        priority=TaskPriority.urgent,
        status=TaskStatus.pending,
        scheduled_at=datetime.now(timezone.utc),
    )
    db.add(task)
    await db.flush()
    return task
