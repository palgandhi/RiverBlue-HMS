"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { Booking } from "@/types";
import { toast } from "sonner";

interface BookingWithGuest extends Booking {
  guest?: { full_name: string; phone: string; email: string | null };
  room?: { room_number: string };
}

export default function CheckInPage() {
  const [ref, setRef] = useState("");
  const [booking, setBooking] = useState<BookingWithGuest | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);

  useEffect(() => {
    api.get("/bookings/?limit=100").then(r => {
      const today = new Date().toISOString().split("T")[0];
      setTodayBookings(r.data.filter((b: Booking) =>
        b.check_in_date === today && b.status === "confirmed"
      ));
    });
  }, []);

  const search = async () => {
    if (!ref.trim()) return;
    setLoading(true);
    setBooking(null);
    try {
      const res = await api.get(`/bookings/${ref.trim().toUpperCase()}`);
      setBooking(res.data);
    } catch {
      toast.error("Booking not found");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!booking) return;
    setActionLoading(true);
    try {
      await api.patch(`/bookings/${booking.booking_ref}`, { status: "checked_in" });
      setBooking({ ...booking, status: "checked_in" });
      toast.success(`Checked in — ${booking.booking_ref}`);
      setTodayBookings(prev => prev.filter(b => b.booking_ref !== booking.booking_ref));
    } catch {
      toast.error("Check-in failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!booking) return;
    setActionLoading(true);
    try {
      await api.patch(`/bookings/${booking.booking_ref}`, { status: "checked_out" });
      setBooking({ ...booking, status: "checked_out" });
      toast.success(`Checked out — ${booking.booking_ref}`);
    } catch {
      toast.error("Check-out failed");
    } finally {
      setActionLoading(false);
    }
  };

  const statusColor: Record<string, string> = {
    confirmed:   "bg-blue-100 text-blue-700",
    checked_in:  "bg-green-100 text-green-700",
    checked_out: "bg-gray-100 text-gray-600",
    cancelled:   "bg-red-100 text-red-700",
    no_show:     "bg-orange-100 text-orange-700",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Check-in / Check-out</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Search by booking reference</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Input
              placeholder="Booking ref e.g. RB-ABC123"
              value={ref}
              onChange={e => setRef(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              className="max-w-xs"
            />
            <Button onClick={search} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </Button>
          </div>

          {booking && (
            <div className="mt-6 border rounded-lg p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-semibold font-mono">{booking.booking_ref}</p>
                  <p className="text-sm text-muted-foreground">
                    {booking.check_in_date} → {booking.check_out_date}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[booking.status]}`}>
                  {booking.status.replace("_", " ")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Guests</p>
                  <p className="font-medium">{booking.num_adults} adults, {booking.num_children} children</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total Amount</p>
                  <p className="font-medium">₹{(booking.total_amount / 100).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Source</p>
                  <p className="font-medium capitalize">{booking.source.replace("_", " ")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Amount Paid</p>
                  <p className="font-medium">₹{(booking.amount_paid / 100).toLocaleString()}</p>
                </div>
              </div>

              {booking.special_requests && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
                  <span className="font-medium">Special requests: </span>
                  {booking.special_requests}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {booking.status === "confirmed" && (
                  <Button onClick={handleCheckIn} disabled={actionLoading} className="bg-green-600 hover:bg-green-700">
                    {actionLoading ? "Processing..." : "✓ Check In"}
                  </Button>
                )}
                {booking.status === "checked_in" && (
                  <Button onClick={handleCheckOut} disabled={actionLoading} variant="outline" className="border-red-300 text-red-700 hover:bg-red-50">
                    {actionLoading ? "Processing..." : "↩ Check Out"}
                  </Button>
                )}
                {booking.status === "checked_out" && (
                  <p className="text-sm text-muted-foreground italic">Guest has checked out.</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {todayBookings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expected Today ({todayBookings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todayBookings.map(b => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => { setRef(b.booking_ref); setBooking(b); }}
                >
                  <div>
                    <p className="text-sm font-mono font-medium">{b.booking_ref}</p>
                    <p className="text-xs text-muted-foreground">{b.num_adults} adults · ₹{(b.total_amount / 100).toLocaleString()}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                    confirmed
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
