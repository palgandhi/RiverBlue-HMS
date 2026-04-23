from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime
import uuid
from app.models.models import BookingStatus, BookingSource


class GuestCreate(BaseModel):
    full_name: str
    email: Optional[str] = None
    phone: str
    id_type: Optional[str] = None
    id_number: Optional[str] = None
    nationality: Optional[str] = None
    address: Optional[str] = None


class GuestResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    email: Optional[str]
    phone: str
    id_type: Optional[str]
    nationality: Optional[str]
    total_stays: int
    created_at: datetime
    model_config = {"from_attributes": True}


class BookingCreate(BaseModel):
    guest_id: uuid.UUID
    room_id: uuid.UUID
    check_in_date: date
    check_out_date: date
    num_adults: int = 1
    num_children: int = 0
    source: BookingSource = BookingSource.direct
    ota_booking_id: Optional[str] = None
    ota_channel: Optional[str] = None
    special_requests: Optional[str] = None

    @field_validator("check_out_date")
    @classmethod
    def checkout_after_checkin(cls, v: date, info) -> date:
        if "check_in_date" in info.data and v <= info.data["check_in_date"]:
            raise ValueError("Check-out must be after check-in")
        return v


class BookingUpdate(BaseModel):
    status: Optional[BookingStatus] = None
    special_requests: Optional[str] = None
    num_adults: Optional[int] = None
    num_children: Optional[int] = None


class BookingResponse(BaseModel):
    id: uuid.UUID
    booking_ref: str
    guest_id: uuid.UUID
    room_id: uuid.UUID
    check_in_date: date
    check_out_date: date
    num_adults: int
    num_children: int
    status: BookingStatus
    source: BookingSource
    ota_booking_id: Optional[str]
    total_amount: int
    amount_paid: int
    special_requests: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}
