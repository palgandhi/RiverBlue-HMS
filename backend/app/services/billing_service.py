from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
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
    item_type: str  # room, fb, laundry, minibar, damage, adjustment, early_checkin, late_checkout
    quantity: int = 1
    unit_price: int  # in paise


class PaymentCreate(BaseModel):
    amount: int  # in paise
    method: PaymentMethod
    transaction_ref: Optional[str] = None


async def get_or_create_folio(db: AsyncSession, booking_id: uuid.UUID) -> Invoice:
    """Get existing invoice or create a new one for a booking."""
    result = await db.execute(
        select(Invoice).where(
            Invoice.booking_id == booking_id,
            Invoice.status != InvoiceStatus.void
        ).order_by(Invoice.status.asc()).limit(1)
    )
    invoice = result.scalar_one_or_none()
    if invoice:
        return invoice

    # Load booking
    booking_result = await db.execute(
        select(Booking).where(Booking.id == booking_id)
    )
    booking = booking_result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Get room and room type
    room_result = await db.execute(select(Room).where(Room.id == booking.room_id))
    room = room_result.scalar_one_or_none()
    rt_result = await db.execute(select(RoomType).where(RoomType.id == room.room_type_id))
    room_type = rt_result.scalar_one_or_none()

    # Generate sequential invoice number
    count_result = await db.execute(select(func.count()).select_from(Invoice))
    count = count_result.scalar() + 1
    inv_number = generate_invoice_number(count)

    # Calculate nights and room subtotal
    nights = nights_between(booking.check_in_date, booking.check_out_date)
    room_subtotal = room_type.base_price_per_night * nights

    # GST is calculated AFTER discount — start with no discount
    gst = calculate_gst(room_subtotal, room_type.base_price_per_night)

    invoice = Invoice(
        booking_id=booking_id,
        invoice_number=inv_number,
        subtotal=room_subtotal,
        tax_amount=gst["total_tax"],
        discount_amount=0,
        total_amount=gst["total_with_tax"],
        status=InvoiceStatus.draft,
    )
    db.add(invoice)
    await db.flush()

    # DO NOT pre-create room charges here.
    # Night audit posts room charges nightly.
    # For same-day check-in/check-out (1 night), post first night charge immediately.
    if nights == 1:
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
        db.add(InvoiceItem(
            invoice_id=invoice.id,
            description=f"CGST @ {int(gst['cgst_rate']*100)}% on accommodation (HSN 9963)",
            item_type="tax",
            quantity=1,
            unit_price=gst["cgst"],
            total_price=gst["cgst"],
        ))
        db.add(InvoiceItem(
            invoice_id=invoice.id,
            description=f"SGST @ {int(gst['sgst_rate']*100)}% on accommodation (HSN 9963)",
            item_type="tax",
            quantity=1,
            unit_price=gst["sgst"],
            total_price=gst["sgst"],
        ))
    else:
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
        # Update invoice to reflect first night only
        invoice.subtotal = room_type.base_price_per_night
        invoice.tax_amount = first_night_gst["total_tax"]
        invoice.total_amount = first_night_gst["total_with_tax"]

    await db.flush()
    return invoice


async def add_line_item(
    db: AsyncSession,
    booking_id: uuid.UUID,
    data: LineItemCreate,
) -> InvoiceItem:
    invoice = await get_or_create_folio(db, booking_id)
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

    if data.item_type == "discount":
        discount_amt = abs(total)
        invoice.discount_amount += discount_amt

        # Recalculate GST on (subtotal - total_discount)
        taxable = invoice.subtotal - invoice.discount_amount

        # Get room type rate for GST rate determination
        from app.models.models import Room, RoomType
        room_result = await db.execute(
            select(Room).join(Booking, Booking.room_id == Room.id)
            .where(Booking.id == booking_id)
        )
        room = room_result.scalar_one_or_none()
        rt_result = await db.execute(select(RoomType).where(RoomType.id == room.room_type_id))
        room_type = rt_result.scalar_one_or_none()

        new_gst = calculate_gst(taxable, room_type.base_price_per_night)

        # Update tax items
        tax_items_result = await db.execute(
            select(InvoiceItem).where(
                InvoiceItem.invoice_id == invoice.id,
                InvoiceItem.item_type == "tax"
            )
        )
        tax_items = tax_items_result.scalars().all()
        for ti in tax_items:
            if "CGST" in ti.description:
                ti.unit_price = new_gst["cgst"]
                ti.total_price = new_gst["cgst"]
            elif "SGST" in ti.description:
                ti.unit_price = new_gst["sgst"]
                ti.total_price = new_gst["sgst"]

        invoice.tax_amount = new_gst["total_tax"]
        invoice.total_amount = taxable + new_gst["total_tax"]
    else:
        invoice.subtotal += total
        # Recalculate tax on new subtotal minus existing discounts
        taxable = invoice.subtotal - invoice.discount_amount
        from app.models.models import Room, RoomType
        room_result = await db.execute(
            select(Room).join(Booking, Booking.room_id == Room.id)
            .where(Booking.id == booking_id)
        )
        room = room_result.scalar_one_or_none()
        rt_result = await db.execute(select(RoomType).where(RoomType.id == room.room_type_id))
        room_type = rt_result.scalar_one_or_none()
        new_gst = calculate_gst(taxable, room_type.base_price_per_night)
        tax_items_result = await db.execute(
            select(InvoiceItem).where(
                InvoiceItem.invoice_id == invoice.id,
                InvoiceItem.item_type == "tax"
            )
        )
        tax_items = tax_items_result.scalars().all()
        for ti in tax_items:
            if "CGST" in ti.description:
                ti.unit_price = new_gst["cgst"]
                ti.total_price = new_gst["cgst"]
            elif "SGST" in ti.description:
                ti.unit_price = new_gst["sgst"]
                ti.total_price = new_gst["sgst"]
        invoice.tax_amount = new_gst["total_tax"]
        invoice.total_amount = taxable + new_gst["total_tax"] + total

    await db.flush()
    return item


async def record_payment(
    db: AsyncSession,
    booking_id: uuid.UUID,
    data: PaymentCreate,
    processed_by: uuid.UUID,
) -> Payment:
    invoice = await get_or_create_folio(db, booking_id)

    if data.amount <= 0:
        raise HTTPException(status_code=422, detail="Payment amount must be greater than 0")

    if data.amount > (invoice.total_amount - invoice.subtotal * 0 ):
        pass  # Allow overpayment — will be handled as credit

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

    # Update booking amount_paid
    booking_result = await db.execute(
        select(Booking).where(Booking.id == booking_id)
    )
    booking = booking_result.scalar_one_or_none()
    if booking:
        booking.amount_paid += data.amount

    # Update invoice status
    total_paid_result = await db.execute(
        select(func.sum(Payment.amount)).where(
            Payment.invoice_id == invoice.id,
            Payment.status == PaymentStatus.completed
        )
    )
    total_paid = (total_paid_result.scalar() or 0) + data.amount

    if total_paid >= invoice.total_amount:
        invoice.status = InvoiceStatus.paid
        invoice.paid_at = datetime.now(timezone.utc)
    elif total_paid > 0:
        invoice.status = InvoiceStatus.partially_paid

    await db.flush()
    return payment


async def finalise_invoice(
    db: AsyncSession,
    booking_id: uuid.UUID,
) -> Invoice:
    invoice = await get_or_create_folio(db, booking_id)
    invoice.status = InvoiceStatus.issued
    invoice.issued_at = datetime.now(timezone.utc)
    await db.flush()
    return invoice


async def get_folio(
    db: AsyncSession,
    booking_id: uuid.UUID,
) -> dict:
    """Get complete folio with items and payments."""
    invoice_result = await db.execute(
        select(Invoice).where(
            Invoice.booking_id == booking_id,
            Invoice.status != InvoiceStatus.void
        ).order_by(Invoice.status.desc()).limit(1)
    )
    invoice = invoice_result.scalar_one_or_none()

    if not invoice:
        # Auto-create folio for any active booking
        booking_result = await db.execute(
            select(Booking).where(Booking.id == booking_id)
        )
        booking = booking_result.scalar_one_or_none()
        if booking and booking.status in [BookingStatus.checked_in, BookingStatus.confirmed]:
            invoice = await get_or_create_folio(db, booking_id)
        else:
            raise HTTPException(status_code=404, detail="No folio found for this booking")

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

    # Get booking info
    booking_result = await db.execute(
        select(Booking).where(Booking.id == booking_id)
    )
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
