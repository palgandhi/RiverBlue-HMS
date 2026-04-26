from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.core.database import get_db
from app.core.security import require_roles
from app.services.billing_service import get_folio
from app.services.settings_service import get_settings
from app.models.models import Booking, Room, RoomType, Guest

router = APIRouter(prefix="/invoice", tags=["Invoice"])


@router.get("/{booking_id}", response_class=HTMLResponse)
async def get_invoice_html(
    booking_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "receptionist")),
):
    folio = await get_folio(db, booking_id)
    hotel = await get_settings(db)

    # Load booking details
    booking_result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = booking_result.scalar_one_or_none()

    guest_result = await db.execute(select(Guest).where(Guest.id == booking.guest_id))
    guest = guest_result.scalar_one_or_none()

    room_result = await db.execute(select(Room).where(Room.id == booking.room_id))
    room = room_result.scalar_one_or_none()

    rt_result = await db.execute(select(RoomType).where(RoomType.id == room.room_type_id))
    room_type = rt_result.scalar_one_or_none()

    inv = folio["invoice"]
    items = folio["items"]
    payments = folio["payments"]
    total_paid = folio["total_paid"]
    balance_due = folio["balance_due"]

    room_items = [i for i in items if i.item_type == "room"]
    tax_items = [i for i in items if i.item_type == "tax"]
    extra_items = [i for i in items if i.item_type not in ["room", "tax"]]

    def fmt(paise): return f"₹{paise/100:,.2f}"

    rows = ""
    sno = 1
    for item in room_items:
        rows += f"""
        <tr>
            <td>{sno}</td>
            <td>{item.description}</td>
            <td>9963</td>
            <td class="right">{item.quantity}</td>
            <td class="right">{fmt(item.unit_price)}</td>
            <td class="right">{fmt(item.total_price)}</td>
        </tr>"""
        sno += 1

    for item in extra_items:
        sign = "-" if item.item_type == "discount" else ""
        rows += f"""
        <tr>
            <td>{sno}</td>
            <td>{item.description} <span class="badge {item.item_type}">{item.item_type}</span></td>
            <td>—</td>
            <td class="right">{item.quantity}</td>
            <td class="right">{sign}{fmt(abs(item.unit_price))}</td>
            <td class="right">{sign}{fmt(abs(item.total_price))}</td>
        </tr>"""
        sno += 1

    payment_rows = ""
    for p in payments:
        from datetime import datetime
        paid_at = datetime.fromisoformat(str(p.paid_at).replace("Z", "+00:00"))
        payment_rows += f"""
        <tr>
            <td>{paid_at.strftime("%d %b %Y %H:%M")}</td>
            <td class="capitalize">{p.method.replace("_", " ").title()}</td>
            <td>{p.transaction_ref or "—"}</td>
            <td class="right green">{fmt(p.amount)}</td>
        </tr>"""

    cgst = next((i for i in tax_items if "CGST" in i.description), None)
    sgst = next((i for i in tax_items if "SGST" in i.description), None)
    cgst_rate = cgst.description.split("@")[1].split("%")[0].strip() if cgst else "6"
    sgst_rate = sgst.description.split("@")[1].split("%")[0].strip() if sgst else "6"

    issued_date = inv.issued_at or inv.paid_at
    from datetime import datetime, timezone
    if not issued_date:
        issued_date = datetime.now(timezone.utc)
    if isinstance(issued_date, str):
        issued_date = datetime.fromisoformat(issued_date.replace("Z", "+00:00"))
    issued_str = issued_date.strftime("%d %B %Y")

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: Arial, sans-serif; font-size: 12px; color: #222; background: white; }}
  .page {{ padding: 32px; max-width: 800px; margin: 0 auto; }}

  .header {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #1F4E79; }}
  .hotel-name {{ font-size: 22px; font-weight: bold; color: #1F4E79; }}
  .hotel-details {{ font-size: 11px; color: #555; margin-top: 4px; line-height: 1.6; }}
  .invoice-title {{ text-align: right; }}
  .invoice-title h2 {{ font-size: 18px; color: #1F4E79; font-weight: bold; }}
  .invoice-title p {{ font-size: 11px; color: #555; margin-top: 3px; }}
  .invoice-title .inv-number {{ font-size: 13px; font-weight: bold; color: #C45A00; margin-top: 4px; }}

  .meta {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }}
  .meta-box {{ background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; }}
  .meta-box h4 {{ font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 6px; }}
  .meta-box p {{ font-size: 12px; line-height: 1.6; }}
  .meta-box strong {{ color: #1F4E79; }}

  table {{ width: 100%; border-collapse: collapse; margin-bottom: 16px; }}
  th {{ background: #1F4E79; color: white; padding: 8px 10px; font-size: 11px; text-align: left; }}
  td {{ padding: 7px 10px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }}
  tr:nth-child(even) td {{ background: #fafafa; }}
  .right {{ text-align: right; }}
  .green {{ color: #16a34a; font-weight: bold; }}
  .red {{ color: #dc2626; }}
  .capitalize {{ text-transform: capitalize; }}
  .badge {{ display: inline-block; padding: 1px 6px; border-radius: 9px; font-size: 9px; margin-left: 4px; }}
  .badge.discount {{ background: #dcfce7; color: #16a34a; }}
  .badge.fb {{ background: #ffedd5; color: #c2410c; }}
  .badge.laundry {{ background: #f3e8ff; color: #7c3aed; }}

  .totals {{ display: flex; justify-content: flex-end; margin-bottom: 20px; }}
  .totals-box {{ width: 280px; }}
  .totals-row {{ display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid #f0f0f0; }}
  .totals-row.bold {{ font-weight: bold; font-size: 13px; color: #1F4E79; border-top: 2px solid #1F4E79; border-bottom: none; padding-top: 8px; margin-top: 4px; }}
  .totals-row.green {{ color: #16a34a; font-weight: bold; }}
  .totals-row.red {{ color: #dc2626; font-weight: bold; }}
  .totals-row.discount {{ color: #16a34a; }}

  .footer {{ margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 10px; color: #888; }}
  .status-badge {{ display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; }}
  .status-paid {{ background: #dcfce7; color: #16a34a; }}
  .status-draft {{ background: #f3f4f6; color: #6b7280; }}
  .status-partially_paid {{ background: #fef9c3; color: #ca8a04; }}
  .gstin-badge {{ background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 4px 8px; font-size: 10px; color: #1d4ed8; margin-top: 4px; display: inline-block; }}
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div>
      <div class="hotel-name">{hotel.hotel_name}</div>
      <div class="hotel-details">
        {hotel.address_line1}{f", {hotel.address_line2}" if hotel.address_line2 else ""}<br>
        {hotel.city} — {hotel.pincode}, {hotel.state}<br>
        {f"Tel: {hotel.phone}" if hotel.phone else ""}{f" | {hotel.email}" if hotel.email else ""}
      </div>
      {f'<div class="gstin-badge">GSTIN: {hotel.gstin}</div>' if hotel.gstin else ""}
    </div>
    <div class="invoice-title">
      <h2>TAX INVOICE</h2>
      <p>Place of Supply: {hotel.state} ({hotel.state_code})</p>
      <div class="inv-number">{inv.invoice_number}</div>
      <p style="margin-top:4px">Date: {issued_str}</p>
      <div style="margin-top:6px">
        <span class="status-badge status-{inv.status}">{inv.status.replace("_"," ").title()}</span>
      </div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-box">
      <h4>Guest Details</h4>
      <p><strong>{guest.full_name}</strong></p>
      <p>{guest.phone}</p>
      {f"<p>{guest.email}</p>" if guest.email else ""}
      {f"<p>{guest.id_type}: {guest.id_number}</p>" if guest.id_type else ""}
    </div>
    <div class="meta-box">
      <h4>Booking Details</h4>
      <p><strong>Ref:</strong> {booking.booking_ref}</p>
      <p><strong>Room:</strong> {room.room_number} — {room_type.name}</p>
      <p><strong>Check-in:</strong> {booking.check_in_date}</p>
      <p><strong>Check-out:</strong> {booking.check_out_date}</p>
      <p><strong>Guests:</strong> {booking.num_adults} adults{f", {booking.num_children} children" if booking.num_children else ""}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Description</th>
        <th style="width:60px">HSN</th>
        <th class="right" style="width:40px">Qty</th>
        <th class="right" style="width:90px">Rate</th>
        <th class="right" style="width:90px">Amount</th>
      </tr>
    </thead>
    <tbody>
      {rows}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>{fmt(inv.subtotal)}</span>
      </div>
      {f'<div class="totals-row discount"><span>Discount</span><span>-{fmt(inv.discount_amount)}</span></div>' if inv.discount_amount else ""}
      <div class="totals-row">
        <span>Taxable Amount</span>
        <span>{fmt(inv.subtotal - inv.discount_amount)}</span>
      </div>
      {f'<div class="totals-row"><span>CGST @ {cgst_rate}%</span><span>{fmt(cgst.total_price)}</span></div>' if cgst else ""}
      {f'<div class="totals-row"><span>SGST @ {sgst_rate}%</span><span>{fmt(sgst.total_price)}</span></div>' if sgst else ""}
      <div class="totals-row bold">
        <span>TOTAL</span>
        <span>{fmt(inv.total_amount)}</span>
      </div>
      <div class="totals-row green">
        <span>Amount Paid</span>
        <span>{fmt(total_paid)}</span>
      </div>
      {f'<div class="totals-row red"><span>Balance Due</span><span>{fmt(balance_due)}</span></div>' if balance_due > 0 else f'<div class="totals-row green"><span>Balance Due</span><span>NIL</span></div>'}
    </div>
  </div>

  {"" if not payments else f"""
  <table>
    <thead>
      <tr>
        <th>Payment Date</th>
        <th>Method</th>
        <th>Reference</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      {payment_rows}
    </tbody>
  </table>
  """}

  <div class="footer">
    <div>
      <strong>This is a computer-generated invoice.</strong><br>
      HSN Code 9963 — Accommodation Services<br>
      {f"GSTIN: {hotel.gstin}" if hotel.gstin else ""}
    </div>
    <div style="text-align:right">
      Thank you for staying at {hotel.hotel_name}<br>
      {f"{hotel.website}" if hotel.website else ""}
    </div>
  </div>

</div>
</body>
</html>"""

    return HTMLResponse(content=html)
