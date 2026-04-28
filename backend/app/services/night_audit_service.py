from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import date, datetime, timezone, timedelta
from typing import Optional
import uuid
import logging

from app.models.models import (
    Booking, BookingStatus, Invoice, InvoiceItem, InvoiceStatus,
    Room, RoomType, RoomStatus, Payment, PaymentStatus,
    DailyStats, NightAuditLog, CheckIn
)
from app.utils.helpers import calculate_gst, nights_between

logger = logging.getLogger("riverblue")


async def run_night_audit(
    db: AsyncSession,
    business_date: Optional[date] = None,
    ran_by: str = "system",
) -> dict:
    """
    Night audit process:
    1. Check no audit has run for this date already
    2. Post room charges for all checked-in guests
    3. Calculate daily statistics
    4. Save audit log
    5. Return summary
    """

    if not business_date:
        business_date = date.today()

    logger.info(f"Night audit starting for {business_date} by {ran_by}")

    # Check if audit already ran for this date
    existing = await db.execute(
        select(NightAuditLog).where(
            NightAuditLog.business_date == business_date,
            NightAuditLog.status == "completed"
        )
    )
    if existing.scalar_one_or_none():
        return {
            "status": "skipped",
            "message": f"Night audit already completed for {business_date}",
            "business_date": str(business_date),
        }

    # Create audit log entry
    audit_log = NightAuditLog(
        business_date=business_date,
        status="running",
        started_at=datetime.now(timezone.utc),
        ran_by=ran_by,
    )
    db.add(audit_log)
    await db.flush()

    try:
        bookings_processed = 0
        charges_posted = 0
        total_revenue = 0
        room_revenue = 0
        fb_revenue = 0
        other_revenue = 0
        total_discounts = 0

        # Get all checked-in bookings
        checkedin_result = await db.execute(
            select(Booking).where(
                Booking.status == BookingStatus.checked_in
            )
        )
        checkedin_bookings = checkedin_result.scalars().all()

        for booking in checkedin_bookings:
            # Only post charge if this night falls within the booking dates
            if not (booking.check_in_date <= business_date < booking.check_out_date):
                continue

            # Get room and room type
            room_result = await db.execute(
                select(Room).where(Room.id == booking.room_id)
            )
            room = room_result.scalar_one_or_none()
            if not room:
                continue

            rt_result = await db.execute(
                select(RoomType).where(RoomType.id == room.room_type_id)
            )
            room_type = rt_result.scalar_one_or_none()
            if not room_type:
                continue

            # Get or create invoice
            invoice_result = await db.execute(
                select(Invoice).where(
                    Invoice.booking_id == booking.id,
                    Invoice.status != InvoiceStatus.void,
                ).limit(1)
            )
            invoice = invoice_result.scalar_one_or_none()

            if not invoice:
                # Create fresh invoice for this booking
                count_result = await db.execute(
                    select(func.count()).select_from(Invoice)
                )
                count = count_result.scalar() + 1
                from app.utils.helpers import generate_invoice_number
                invoice = Invoice(
                    booking_id=booking.id,
                    invoice_number=generate_invoice_number(count),
                    subtotal=0,
                    tax_amount=0,
                    discount_amount=0,
                    total_amount=0,
                    status=InvoiceStatus.draft,
                )
                db.add(invoice)
                await db.flush()

            # Check if charge already posted for this night
            night_label = business_date.strftime("%d %b %Y")
            existing_charge = await db.execute(
                select(InvoiceItem).where(
                    InvoiceItem.invoice_id == invoice.id,
                    InvoiceItem.item_type == "room",
                    InvoiceItem.description.contains(night_label),
                )
            )
            if existing_charge.scalar_one_or_none():
                logger.info(f"Room charge already posted for {booking.booking_ref} on {business_date}")
                continue

            # Post room charge for tonight
            night_charge = room_type.base_price_per_night
            db.add(InvoiceItem(
                invoice_id=invoice.id,
                description=f"Room {room.room_number} — {room_type.name} ({night_label})",
                item_type="room",
                quantity=1,
                unit_price=night_charge,
                total_price=night_charge,
            ))

            # Update invoice subtotal
            invoice.subtotal += night_charge

            # Recalculate GST on updated subtotal minus discounts
            taxable = invoice.subtotal - invoice.discount_amount
            gst = calculate_gst(taxable, room_type.base_price_per_night)

            # Update or create tax line items
            tax_result = await db.execute(
                select(InvoiceItem).where(
                    InvoiceItem.invoice_id == invoice.id,
                    InvoiceItem.item_type == "tax",
                )
            )
            tax_items = tax_result.scalars().all()

            cgst_item = next((t for t in tax_items if "CGST" in t.description), None)
            sgst_item = next((t for t in tax_items if "SGST" in t.description), None)

            if cgst_item:
                cgst_item.unit_price = gst["cgst"]
                cgst_item.total_price = gst["cgst"]
            else:
                db.add(InvoiceItem(
                    invoice_id=invoice.id,
                    description=f"CGST @ {int(gst['cgst_rate']*100)}% on accommodation (HSN 9963)",
                    item_type="tax",
                    quantity=1,
                    unit_price=gst["cgst"],
                    total_price=gst["cgst"],
                ))

            if sgst_item:
                sgst_item.unit_price = gst["sgst"]
                sgst_item.total_price = gst["sgst"]
            else:
                db.add(InvoiceItem(
                    invoice_id=invoice.id,
                    description=f"SGST @ {int(gst['sgst_rate']*100)}% on accommodation (HSN 9963)",
                    item_type="tax",
                    quantity=1,
                    unit_price=gst["sgst"],
                    total_price=gst["sgst"],
                ))

            invoice.tax_amount = gst["total_tax"]
            invoice.total_amount = taxable + gst["total_tax"]

            room_revenue += night_charge
            total_revenue += night_charge
            charges_posted += 1
            bookings_processed += 1

            logger.info(f"Posted room charge for {booking.booking_ref}: {room_type.name} ₹{night_charge/100}")

        await db.flush()

        # Calculate revenue from all invoices for this date
        all_payments_result = await db.execute(
            select(func.sum(Payment.amount)).where(
                Payment.status == PaymentStatus.completed,
                func.date(Payment.paid_at) == business_date,
            )
        )
        daily_payments = all_payments_result.scalar() or 0

        # Count rooms
        all_rooms_result = await db.execute(select(func.count()).select_from(Room))
        total_rooms = all_rooms_result.scalar() or 0

        occupied_result = await db.execute(
            select(func.count()).select_from(Room).where(Room.status == RoomStatus.occupied)
        )
        occupied_rooms = occupied_result.scalar() or 0

        oot_result = await db.execute(
            select(func.count()).select_from(Room).where(Room.status == RoomStatus.out_of_order)
        )
        oot_rooms = oot_result.scalar() or 0

        available_for_occ = total_rooms - oot_rooms
        occ_pct = int((occupied_rooms / available_for_occ * 100)) if available_for_occ > 0 else 0
        adr = int(room_revenue / occupied_rooms) if occupied_rooms > 0 else 0
        revpar = int(room_revenue / available_for_occ) if available_for_occ > 0 else 0

        # Count checkins/checkouts today
        checkins_result = await db.execute(
            select(func.count()).select_from(CheckIn).where(
                func.date(CheckIn.checkin_time) == business_date
            )
        )
        checkins_today = checkins_result.scalar() or 0

        checkouts_result = await db.execute(
            select(func.count()).select_from(CheckIn).where(
                func.date(CheckIn.checkout_time) == business_date
            )
        )
        checkouts_today = checkouts_result.scalar() or 0

        new_bookings_result = await db.execute(
            select(func.count()).select_from(Booking).where(
                func.date(Booking.created_at) == business_date
            )
        )
        new_bookings = new_bookings_result.scalar() or 0

        no_shows_result = await db.execute(
            select(func.count()).select_from(Booking).where(
                Booking.status == BookingStatus.no_show,
                Booking.check_in_date == business_date,
            )
        )
        no_shows = no_shows_result.scalar() or 0

        # Save daily stats
        existing_stats = await db.execute(
            select(DailyStats).where(DailyStats.business_date == business_date)
        )
        stats = existing_stats.scalar_one_or_none()
        if not stats:
            stats = DailyStats(business_date=business_date)
            db.add(stats)

        stats.total_rooms = total_rooms
        stats.occupied_rooms = occupied_rooms
        stats.available_rooms = available_for_occ - occupied_rooms
        stats.out_of_order_rooms = oot_rooms
        stats.occupancy_pct = occ_pct
        stats.room_revenue = room_revenue
        stats.total_revenue = daily_payments
        stats.new_bookings = new_bookings
        stats.checkins_count = checkins_today
        stats.checkouts_count = checkouts_today
        stats.no_shows_count = no_shows
        stats.adr = adr
        stats.revpar = revpar
        stats.audit_ran_at = datetime.now(timezone.utc)
        stats.audit_ran_by = ran_by

        # Mark audit complete
        audit_log.status = "completed"
        audit_log.completed_at = datetime.now(timezone.utc)
        audit_log.bookings_processed = bookings_processed
        audit_log.charges_posted = charges_posted
        audit_log.total_revenue_posted = room_revenue

        await db.flush()

        summary = {
            "status": "completed",
            "business_date": str(business_date),
            "bookings_processed": bookings_processed,
            "charges_posted": charges_posted,
            "room_revenue_posted": room_revenue,
            "occupied_rooms": occupied_rooms,
            "total_rooms": total_rooms,
            "occupancy_pct": occ_pct,
            "adr": adr,
            "revpar": revpar,
            "checkins_today": checkins_today,
            "checkouts_today": checkouts_today,
            "new_bookings": new_bookings,
        }

        logger.info(f"Night audit completed for {business_date}: {bookings_processed} bookings, ₹{room_revenue/100} revenue")
        return summary

    except Exception as e:
        audit_log.status = "failed"
        audit_log.error_message = str(e)
        audit_log.completed_at = datetime.now(timezone.utc)
        await db.flush()
        logger.error(f"Night audit failed for {business_date}: {e}")
        raise
