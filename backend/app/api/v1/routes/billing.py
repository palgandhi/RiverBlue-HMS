from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import uuid

from app.core.database import get_db
from app.core.security import require_roles, get_current_user
from app.models.models import Invoice, InvoiceItem, Payment, PaymentMethod
from app.services.billing_service import (
    get_folio, add_line_item, record_payment,
    finalise_invoice, LineItemCreate, PaymentCreate
)

router = APIRouter(prefix="/billing", tags=["Billing & Folio"])


class InvoiceItemResponse(BaseModel):
    id: uuid.UUID
    description: str
    item_type: str
    quantity: int
    unit_price: int
    total_price: int
    model_config = {"from_attributes": True}


class PaymentResponse(BaseModel):
    id: uuid.UUID
    amount: int
    method: str
    transaction_ref: Optional[str]
    status: str
    paid_at: datetime
    model_config = {"from_attributes": True}


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    invoice_number: str
    subtotal: int
    tax_amount: int
    discount_amount: int
    total_amount: int
    status: str
    issued_at: Optional[datetime]
    paid_at: Optional[datetime]
    model_config = {"from_attributes": True}


class FolioResponse(BaseModel):
    invoice: InvoiceResponse
    items: List[InvoiceItemResponse]
    payments: List[PaymentResponse]
    total_paid: int
    balance_due: int
    booking_status: str
    booking_ref: str


@router.get("/folio/{booking_id}", response_model=FolioResponse)
async def get_booking_folio(
    booking_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    return await get_folio(db, booking_id)


@router.post("/folio/{booking_id}/items", response_model=InvoiceItemResponse, status_code=201)
async def add_charge(
    booking_id: uuid.UUID,
    data: LineItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    return await add_line_item(db, booking_id, data)


@router.post("/folio/{booking_id}/payments", response_model=PaymentResponse, status_code=201)
async def add_payment(
    booking_id: uuid.UUID,
    data: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    return await record_payment(db, booking_id, data, current_user.id)


@router.post("/folio/{booking_id}/finalise", response_model=InvoiceResponse)
async def finalise(
    booking_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    return await finalise_invoice(db, booking_id)
