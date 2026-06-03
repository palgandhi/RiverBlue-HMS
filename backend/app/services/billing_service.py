from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid

from app.models.models import (
    Invoice, InvoiceItem, Payment, Booking, Room, RoomType,
    InvoiceStatus, PaymentMethod, PaymentStatus, BookingStatus
)
from app.utils.helpers import calculate_gst, generate_invoice_number, nights_between
from fastapi import HTTPException
from pydantic import BaseModel


class LineItemCreate(BaseModel):
    description: str
    item_type: str  # room, fb, laundry, minibar, damage, adjustment, early_checkin, late_checkout, discount
    quantity: int = 1
    unit_price: int  # in paise


class PaymentCreate(BaseModel):
    amount: int  # in paise
    method: PaymentMethod
    transaction_ref: Optional[str] = None


async def recalculate_invoice_totals(db: AsyncSession, invoice_id: uuid.UUID) -> None:
    """Recalculates subtotals, GST taxes, and grand totals of an invoice based on its items."""
    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    invoice = result.scalar_one_or_none()
    if not invoice:
        return

    # Load all non-tax items
    items_result = await db.execute(
        select(InvoiceItem).where(
            InvoiceItem.invoice_id == invoice_id,
            InvoiceItem.item_type != "tax"
        )
    )
    items = items_result.scalars().all()

    subtotal = 0
    discount_amount = 0
    for item in items:
        if item.item_type == "discount":
            discount_amount += abs(item.total_price)
        else:
            subtotal += item.total_price

    invoice.subtotal = subtotal
    invoice.discount_amount = discount_amount

    # GST is calculated on taxable accommodation subtotal
    taxable = subtotal - discount_amount

    # Get booking room type to verify price tier for GST rate
    from app.models.models import Room, RoomType, Booking
    room_result = await db.execute(
        select(Room).join(Booking, Booking.room_id == Room.id)
        .where(Booking.id == invoice.booking_id)
    )
    room = room_result.scalar_one_or_none()
    if room:
        rt_result = await db.execute(select(RoomType).where(RoomType.id == room.room_type_id))
        room_type = rt_result.scalar_one_or_none()
        base_price = room_type.base_price_per_night if room_type else 0
    else:
        base_price = 0

    new_gst = calculate_gst(taxable, base_price)

    # Update or create CGST/SGST line items
    tax_items_result = await db.execute(
        select(InvoiceItem).where(
            InvoiceItem.invoice_id == invoice_id,
            InvoiceItem.item_type == "tax"
        )
    )
    tax_items = tax_items_result.scalars().all()

    cgst_item = next((ti for ti in tax_items if "CGST" in ti.description), None)
    sgst_item = next((ti for ti in tax_items if "SGST" in ti.description), None)

    if new_gst["total_tax"] > 0:
        if cgst_item:
            cgst_item.unit_price = new_gst["cgst"]
            cgst_item.total_price = new_gst["cgst"]
        else:
            cgst_item = InvoiceItem(
                invoice_id=invoice_id,
                description=f"CGST @ {int(new_gst['cgst_rate']*100)}% on accommodation (HSN 9963)",
                item_type="tax",
                quantity=1,
                unit_price=new_gst["cgst"],
                total_price=new_gst["cgst"]
            )
            db.add(cgst_item)

        if sgst_item:
            sgst_item.unit_price = new_gst["sgst"]
            sgst_item.total_price = new_gst["sgst"]
        else:
            sgst_item = InvoiceItem(
                invoice_id=invoice_id,
                description=f"SGST @ {int(new_gst['sgst_rate']*100)}% on accommodation (HSN 9963)",
                item_type="tax",
                quantity=1,
                unit_price=new_gst["sgst"],
                total_price=new_gst["sgst"]
            )
            db.add(sgst_item)
    else:
        # Delete existing tax rows if no tax is due
        for ti in tax_items:
            await db.delete(ti)

    invoice.tax_amount = new_gst["total_tax"]
    invoice.total_amount = taxable + new_gst["total_tax"]
    await db.flush()


async def get_or_create_folio(db: AsyncSession, booking_id: uuid.UUID, invoice_id: Optional[uuid.UUID] = None) -> Invoice:
    """Get a specific invoice or the primary one for a booking, creating it if none exists."""
    if invoice_id:
        result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise HTTPException(status_code=404, detail="Requested invoice/folio not found")
        return invoice

    # Fallback to the first active/draft folio
    result = await db.execute(
        select(Invoice).where(
            Invoice.booking_id == booking_id,
            Invoice.status != InvoiceStatus.void
        ).order_by(Invoice.label.desc(), Invoice.status.asc()).limit(1)
    )
    invoice = result.scalar_one_or_none()
    if invoice:
        return invoice

    # Create primary folio if none exists
    booking_result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = booking_result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    room_result = await db.execute(select(Room).where(Room.id == booking.room_id))
    room = room_result.scalar_one_or_none()
    rt_result = await db.execute(select(RoomType).where(RoomType.id == room.room_type_id))
    room_type = rt_result.scalar_one_or_none()

    count_result = await db.execute(select(func.count()).select_from(Invoice))
    count = count_result.scalar() + 1
    inv_number = generate_invoice_number(count)

    nights = nights_between(booking.check_in_date, booking.check_out_date)
    room_subtotal = room_type.base_price_per_night * nights
    gst = calculate_gst(room_subtotal, room_type.base_price_per_night)

    invoice = Invoice(
        booking_id=booking_id,
        invoice_number=inv_number,
        subtotal=room_subtotal,
        tax_amount=gst["total_tax"],
        discount_amount=0,
        total_amount=gst["total_with_tax"],
        status=InvoiceStatus.draft,
        label="Primary",
    )
    db.add(invoice)
    await db.flush()

    # Multi-night stays: post first night immediately, rest via night audit
    checkin_date = booking.check_in_date
    night_label = checkin_date.strftime("%d %b %Y")
    db.add(InvoiceItem(
        invoice_id=invoice.id,
        description=f"Room {room.room_number} — {room_type.name} ({night_label})",
        item_type="room",
        quantity=1,
        unit_price=room_type.base_price_per_night,
        total_price=room_type.base_price_per_night,
    ))

    # Initial GST on first night only
    first_night_gst = calculate_gst(room_type.base_price_per_night, room_type.base_price_per_night)
    db.add(InvoiceItem(
        invoice_id=invoice.id,
        description=f"CGST @ {int(first_night_gst['cgst_rate']*100)}% on accommodation (HSN 9963)",
        item_type="tax",
        quantity=1,
        unit_price=first_night_gst["cgst"],
        total_price=first_night_gst["cgst"],
    ))
    db.add(InvoiceItem(
        invoice_id=invoice.id,
        description=f"SGST @ {int(first_night_gst['sgst_rate']*100)}% on accommodation (HSN 9963)",
        item_type="tax",
        quantity=1,
        unit_price=first_night_gst["sgst"],
        total_price=first_night_gst["sgst"],
    ))

    invoice.subtotal = room_type.base_price_per_night
    invoice.tax_amount = first_night_gst["total_tax"]
    invoice.total_amount = first_night_gst["total_with_tax"]

    await db.flush()
    return invoice


async def create_split_folio(db: AsyncSession, booking_id: uuid.UUID, label: str) -> Invoice:
    """Creates a secondary split folio for extras or separate corporate billing."""
    booking_result = await db.execute(select(Booking).where(Booking.id == booking_id))
    if not booking_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Booking not found")

    count_result = await db.execute(select(func.count()).select_from(Invoice))
    count = count_result.scalar() + 1
    inv_number = generate_invoice_number(count)

    invoice = Invoice(
        booking_id=booking_id,
        invoice_number=inv_number,
        subtotal=0,
        tax_amount=0,
        discount_amount=0,
        total_amount=0,
        status=InvoiceStatus.draft,
        label=label,
    )
    db.add(invoice)
    await db.flush()

    from app.services.audit_log_service import log_action
    await log_action(
        db,
        action="create_split_folio",
        entity_type="Invoice",
        entity_id=str(invoice.id),
        new_value={
            "invoice_number": invoice.invoice_number,
            "booking_id": str(booking_id),
            "label": label,
        }
    )
    return invoice


async def add_line_item(
    db: AsyncSession,
    booking_id: uuid.UUID,
    data: LineItemCreate,
    invoice_id: Optional[uuid.UUID] = None,
) -> InvoiceItem:
    """Adds a line item charge or discount to the specified folio (defaults to Primary)."""
    invoice = await get_or_create_folio(db, booking_id, invoice_id)
    if invoice.status not in [InvoiceStatus.draft]:
        raise HTTPException(status_code=409, detail="Cannot add items to a finalised invoice")

    total = data.quantity * data.unit_price

    item = InvoiceItem(
        invoice_id=invoice.id,
        description=data.description,
        item_type=data.item_type,
        quantity=data.quantity,
        unit_price=data.unit_price,
        total_price=total,
    )
    db.add(item)
    await db.flush()

    # Recalculate complete totals
    await recalculate_invoice_totals(db, invoice.id)

    from app.services.audit_log_service import log_action
    await log_action(
        db,
        action="post_charge",
        entity_type="Invoice",
        entity_id=str(invoice.id),
        new_value={
            "item_id": str(item.id),
            "description": item.description,
            "item_type": item.item_type,
            "total_price": item.total_price,
            "invoice_total": invoice.total_amount,
        }
    )
    return item


async def record_payment(
    db: AsyncSession,
    booking_id: uuid.UUID,
    data: PaymentCreate,
    processed_by: uuid.UUID,
    invoice_id: Optional[uuid.UUID] = None,
) -> Payment:
    """Records a payment against a specific folio (defaults to Primary)."""
    invoice = await get_or_create_folio(db, booking_id, invoice_id)

    if data.amount <= 0:
        raise HTTPException(status_code=422, detail="Payment amount must be greater than 0")

    payment = Payment(
        invoice_id=invoice.id,
        processed_by=processed_by,
        amount=data.amount,
        method=data.method,
        transaction_ref=data.transaction_ref,
        status=PaymentStatus.completed,
        paid_at=datetime.now(timezone.utc),
    )
    db.add(payment)
    await db.flush()

    # Update booking amount_paid by summing up all completed payments for this booking's invoices
    invoice_ids_result = await db.execute(
        select(Invoice.id).where(Invoice.booking_id == booking_id)
    )
    invoice_ids = invoice_ids_result.scalars().all()
    all_payments_sum = await db.execute(
        select(func.sum(Payment.amount)).where(
            Payment.invoice_id.in_(invoice_ids),
            Payment.status == PaymentStatus.completed
        )
    )
    total_booking_paid = all_payments_sum.scalar() or 0

    booking_result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = booking_result.scalar_one_or_none()
    if booking:
        booking.amount_paid = total_booking_paid

    # Recalculate invoice paid status
    total_paid_result = await db.execute(
        select(func.sum(Payment.amount)).where(
            Payment.invoice_id == invoice.id,
            Payment.status == PaymentStatus.completed
        )
    )
    total_paid = total_paid_result.scalar() or 0

    if total_paid >= invoice.total_amount:
        invoice.status = InvoiceStatus.paid
        invoice.paid_at = datetime.now(timezone.utc)
    elif total_paid > 0:
        invoice.status = InvoiceStatus.partially_paid

    await db.flush()

    from app.services.audit_log_service import log_action
    await log_action(
        db,
        action="post_payment",
        entity_type="Invoice",
        entity_id=str(invoice.id),
        new_value={
            "payment_id": str(payment.id),
            "amount": payment.amount,
            "method": payment.method,
            "transaction_ref": payment.transaction_ref,
            "invoice_status": invoice.status,
        }
    )
    return payment


async def finalise_invoice(
    db: AsyncSession,
    booking_id: uuid.UUID,
    invoice_id: Optional[uuid.UUID] = None,
) -> Invoice:
    """Finalises an invoice, setting its status to issued."""
    invoice = await get_or_create_folio(db, booking_id, invoice_id)
    invoice.status = InvoiceStatus.issued
    invoice.issued_at = datetime.now(timezone.utc)
    await db.flush()

    from app.services.audit_log_service import log_action
    await log_action(
        db,
        action="finalise_invoice",
        entity_type="Invoice",
        entity_id=str(invoice.id),
        old_value={"status": "draft"},
        new_value={"status": "issued"}
    )
    return invoice


async def transfer_line_item(
    db: AsyncSession,
    item_id: uuid.UUID,
    target_invoice_id: uuid.UUID,
) -> InvoiceItem:
    """Transfers a line item from its current invoice to a different draft invoice."""
    # Load item
    item_result = await db.execute(select(InvoiceItem).where(InvoiceItem.id == item_id))
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Line item not found")

    source_invoice_id = item.invoice_id
    if source_invoice_id == target_invoice_id:
        raise HTTPException(status_code=400, detail="Source and target invoice are the same")

    # Load source & target invoices
    inv_result = await db.execute(
        select(Invoice).where(Invoice.id.in_([source_invoice_id, target_invoice_id]))
    )
    invoices = inv_result.scalars().all()
    source_invoice = next((i for i in invoices if i.id == source_invoice_id), None)
    target_invoice = next((i for i in invoices if i.id == target_invoice_id), None)

    if not source_invoice or not target_invoice:
        raise HTTPException(status_code=404, detail="Source or target invoice not found")

    # Constraints: both must be draft
    if source_invoice.status not in [InvoiceStatus.draft] or target_invoice.status not in [InvoiceStatus.draft]:
        raise HTTPException(status_code=409, detail="Cannot transfer items between non-draft invoices")

    # Cannot transfer tax lines directly (they are recalculated)
    if item.item_type == "tax":
        raise HTTPException(status_code=400, detail="Cannot transfer tax items. Move base charges; tax will recalculate.")

    # Re-assign
    item.invoice_id = target_invoice_id
    await db.flush()

    # Recalculate both invoices
    await recalculate_invoice_totals(db, source_invoice_id)
    await recalculate_invoice_totals(db, target_invoice_id)

    from app.services.audit_log_service import log_action
    await log_action(
        db,
        action="transfer_charge",
        entity_type="InvoiceItem",
        entity_id=str(item.id),
        old_value={
            "invoice_id": str(source_invoice_id),
            "invoice_number": source_invoice.invoice_number,
        },
        new_value={
            "invoice_id": str(target_invoice_id),
            "invoice_number": target_invoice.invoice_number,
        }
    )
    return item


async def get_folio(
    db: AsyncSession,
    booking_id: uuid.UUID,
    invoice_id: Optional[uuid.UUID] = None,
) -> dict:
    """Get complete details for a specific invoice (or the primary one if not specified)."""
    invoice = await get_or_create_folio(db, booking_id, invoice_id)

    items_result = await db.execute(
        select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)
        .order_by(InvoiceItem.item_type)
    )
    items = items_result.scalars().all()

    payments_result = await db.execute(
        select(Payment).where(Payment.invoice_id == invoice.id)
        .order_by(Payment.paid_at)
    )
    payments = payments_result.scalars().all()

    total_paid = sum(p.amount for p in payments if p.status == PaymentStatus.completed)
    balance_due = invoice.total_amount - total_paid

    booking_result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = booking_result.scalar_one_or_none()

    return {
        "invoice": invoice,
        "items": items,
        "payments": payments,
        "total_paid": total_paid,
        "balance_due": balance_due,
        "booking_status": booking.status if booking else "unknown",
        "booking_ref": booking.booking_ref if booking else "",
    }


async def list_booking_folios(db: AsyncSession, booking_id: uuid.UUID) -> List[Invoice]:
    """Returns a list of all invoices (folios) for a booking."""
    result = await db.execute(
        select(Invoice).where(
            Invoice.booking_id == booking_id,
            Invoice.status != InvoiceStatus.void
        ).order_by(Invoice.invoice_number)
    )
    return result.scalars().all()
