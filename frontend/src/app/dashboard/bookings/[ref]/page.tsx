"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, BedDouble, Calendar, User, Receipt,
  LogIn, LogOut, XCircle, AlertTriangle, Pencil, Phone, Mail, CreditCard
} from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";

interface BookingDetail {
  id: string;
  booking_ref: string;
  guest_id: string;
  room_id: string;
  check_in_date: string;
  check_out_date: string;
  num_adults: number;
  num_children: number;
  status: string;
  source: string;
  ota_booking_id: string | null;
  ota_channel: string | null;
  total_amount: number;
  amount_paid: number;
  special_requests: string | null;
  created_at: string;
}

interface GuestInfo {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  id_type: string | null;
  id_number: string | null;
  nationality: string | null;
  total_stays: number;
}

interface RoomInfo {
  id: string;
  room_number: string;
  floor: number;
  status: string;
  room_type_id: string;
}

interface RoomTypeInfo {
  id: string;
  name: string;
  base_price_per_night: number;
  max_occupancy: number;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  confirmed:   { label: "Confirmed",   color: "text-blue-700",  bg: "bg-blue-50 border-blue-200" },
  checked_in:  { label: "Checked In",  color: "text-green-700", bg: "bg-green-50 border-green-200" },
  checked_out: { label: "Checked Out", color: "text-gray-600",  bg: "bg-gray-50 border-gray-200" },
  cancelled:   { label: "Cancelled",   color: "text-red-700",   bg: "bg-red-50 border-red-200" },
  no_show:     { label: "No Show",     color: "text-orange-700",bg: "bg-orange-50 border-orange-200" },
};

const sourceLabel: Record<string, string> = {
  direct: "Direct", walk_in: "Walk-in", makemytrip: "MakeMyTrip",
  ixigo: "Ixigo", booking_com: "Booking.com", expedia: "Expedia",
  phone: "Phone", other: "Other", channel_manager: "Channel Manager",
};

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ref = (params.ref as string).toUpperCase();

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [guest, setGuest] = useState<GuestInfo | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [roomType, setRoomType] = useState<RoomTypeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ special_requests: "" });
  const [saving, setSaving] = useState(false);

  // Invoice dialog
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceHtml, setInvoiceHtml] = useState("");
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  useEffect(() => { loadBooking(); }, [ref]);

  const loadBooking = async () => {
    setLoading(true);
    try {
      const bRes = await api.get(`/bookings/${ref}`);
      const b: BookingDetail = bRes.data;
      setBooking(b);
      setEditForm({ special_requests: b.special_requests || "" });

      // Load guest + room in parallel
      const [roomsRes, typesRes] = await Promise.all([
        api.get("/rooms/"),
        api.get("/rooms/types"),
      ]);
      const roomObj = roomsRes.data.find((r: RoomInfo) => r.id === b.room_id);
      if (roomObj) {
        setRoom(roomObj);
        const rt = typesRes.data.find((t: RoomTypeInfo) => t.id === roomObj.room_type_id);
        setRoomType(rt || null);
      }
    } catch {
      toast.error("Booking not found");
      router.push("/dashboard/bookings");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckin = async () => {
    if (!booking) return;
    setActing(true);
    try {
      await api.post("/checkins/", { booking_ref: booking.booking_ref });
      toast.success("Guest checked in successfully");
      loadBooking();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Check-in failed");
    } finally { setActing(false); }
  };

  const handleCheckout = async () => {
    if (!booking) return;
    // Check balance first
    try {
      const folioRes = await api.get(`/billing/folio/${booking.id}`);
      if (folioRes.data.balance_due > 0) {
        const bal = (folioRes.data.balance_due / 100).toLocaleString("en-IN");
        toast.error(`Cannot check out — outstanding balance ₹${bal}. Collect payment first.`);
        return;
      }
    } catch {}
    setActing(true);
    try {
      await api.post(`/checkins/${booking.booking_ref}/checkout`, {});
      toast.success("Guest checked out");
      loadBooking();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Checkout failed");
    } finally { setActing(false); }
  };

  const handleCancel = async () => {
    if (!booking) return;
    if (!confirm(`Cancel booking ${booking.booking_ref}? This cannot be undone.`)) return;
    setActing(true);
    try {
      await api.post(`/bookings/${booking.booking_ref}/cancel`);
      toast.success("Booking cancelled");
      loadBooking();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Cancel failed");
    } finally { setActing(false); }
  };

  const handleNoShow = async () => {
    if (!booking) return;
    if (!confirm(`Mark ${booking.booking_ref} as no-show?`)) return;
    setActing(true);
    try {
      await api.post(`/bookings/${booking.booking_ref}/no-show`);
      toast.success("Marked as no-show");
      loadBooking();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setActing(false); }
  };

  const handleSaveEdit = async () => {
    if (!booking) return;
    setSaving(true);
    try {
      await api.patch(`/bookings/${booking.booking_ref}`, editForm);
      toast.success("Booking updated");
      setEditOpen(false);
      loadBooking();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to update");
    } finally { setSaving(false); }
  };

  const openInvoice = async () => {
    if (!booking) return;
    setInvoiceLoading(true);
    setInvoiceOpen(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/invoice/${booking.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const html = await res.text();
      setInvoiceHtml(html);
    } catch {
      toast.error("Failed to load invoice");
      setInvoiceOpen(false);
    } finally { setInvoiceLoading(false); }
  };

  const printInvoice = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(invoiceHtml);
    win.document.close();
    win.focus();
    win.print();
  };

  if (loading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}
    </div>
  );

  if (!booking) return null;

  const cfg = statusConfig[booking.status] || statusConfig.confirmed;
  const nights = Math.max(1,
    (new Date(booking.check_out_date).getTime() - new Date(booking.check_in_date).getTime()) / 86400000
  );
  const balance = booking.total_amount - booking.amount_paid;

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/dashboard/bookings")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold font-mono">{booking.booking_ref}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sourceLabel[booking.source] || booking.source}
              {booking.ota_booking_id && ` · OTA ref: ${booking.ota_booking_id}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3 w-3 mr-1" /> Edit
          </Button>
        </div>
      </div>

      {/* Key info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Check-in</p>
            <p className="text-base font-bold mt-1">{new Date(booking.check_in_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Check-out</p>
            <p className="text-base font-bold mt-1">{new Date(booking.check_out_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
            <p className="text-xs text-muted-foreground">{nights} night{nights !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="text-base font-bold mt-1">₹{(booking.total_amount / 100).toLocaleString("en-IN")}</p>
            <p className="text-xs text-muted-foreground">₹{(booking.amount_paid / 100).toLocaleString("en-IN")} paid</p>
          </CardContent>
        </Card>
        <Card className={balance > 0 ? "border-red-200" : "border-green-200"}>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Balance</p>
            <p className={`text-base font-bold mt-1 ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
              {balance > 0 ? `₹${(balance / 100).toLocaleString("en-IN")}` : "Settled"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Guest + Room */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Guest
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-semibold">{booking.num_adults} adult{booking.num_adults > 1 ? "s" : ""}
              {booking.num_children > 0 && `, ${booking.num_children} children`}
            </p>
            <p className="text-sm text-muted-foreground">
              <Link href={`/dashboard/guests?id=${booking.guest_id}`} className="text-primary hover:underline font-medium">
                View guest profile →
              </Link>
            </p>
            {booking.special_requests && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                <span className="font-semibold">Special requests: </span>{booking.special_requests}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BedDouble className="h-4 w-4 text-primary" /> Room
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {room && roomType ? (
              <>
                <p className="font-semibold text-lg">Room {room.room_number}</p>
                <p className="text-sm text-muted-foreground">{roomType.name} · Floor {room.floor}</p>
                <p className="text-sm">₹{(roomType.base_price_per_night / 100).toLocaleString("en-IN")}/night · max {roomType.max_occupancy} guests</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Room details unavailable</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline" size="sm"
              onClick={openInvoice}
              className="gap-2"
            >
              <Receipt className="h-4 w-4" /> View Invoice
            </Button>

            <Link href={`/dashboard/billing?booking_id=${booking.id}&ref=${booking.booking_ref}`}>
              <Button variant="outline" size="sm" className="gap-2">
                <CreditCard className="h-4 w-4" /> Manage Folio
              </Button>
            </Link>

            {booking.status === "confirmed" && (
              <>
                <Button
                  size="sm" onClick={handleCheckin} disabled={acting}
                  className="bg-green-600 hover:bg-green-700 gap-2"
                >
                  <LogIn className="h-4 w-4" /> Check In
                </Button>
                <Button
                  size="sm" variant="outline" onClick={handleNoShow} disabled={acting}
                  className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-2"
                >
                  <AlertTriangle className="h-4 w-4" /> No Show
                </Button>
                <Button
                  size="sm" variant="outline" onClick={handleCancel} disabled={acting}
                  className="border-red-300 text-red-700 hover:bg-red-50 gap-2"
                >
                  <XCircle className="h-4 w-4" /> Cancel
                </Button>
              </>
            )}

            {booking.status === "checked_in" && (
              <Button
                size="sm" variant="outline" onClick={handleCheckout} disabled={acting}
                className="border-red-300 text-red-700 hover:bg-red-50 gap-2"
              >
                <LogOut className="h-4 w-4" /> Check Out
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm bg-card">
          <DialogHeader><DialogTitle>Edit Booking</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Special Requests / Notes</Label>
              <Input
                placeholder="Guest preferences, allergies, etc."
                value={editForm.special_requests}
                onChange={e => setEditForm(f => ({ ...f, special_requests: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSaveEdit} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice dialog */}
      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] bg-card p-0">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">Invoice — {booking.booking_ref}</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={printInvoice} disabled={invoiceLoading}>
                🖨️ Print / Save PDF
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setInvoiceOpen(false)}>✕</Button>
            </div>
          </div>
          <div className="overflow-y-auto max-h-[calc(90vh-64px)]">
            {invoiceLoading ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading invoice...</div>
            ) : (
              <iframe
                srcDoc={invoiceHtml}
                className="w-full h-[75vh] border-0"
                title="Invoice"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
