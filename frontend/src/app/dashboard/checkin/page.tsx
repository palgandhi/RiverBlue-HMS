"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, LogIn, LogOut, Clock } from "lucide-react";
import api from "@/lib/api";
import { Booking } from "@/types";
import { toast } from "sonner";

export default function CheckInPage() {
  const [ref, setRef] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [keyCard, setKeyCard] = useState("");
  const [remarks, setRemarks] = useState("");
  const [todayArrivals, setTodayArrivals] = useState<Booking[]>([]);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    api.get("/bookings/?limit=100").then(r => {
      setTodayArrivals(r.data.filter((b: Booking) =>
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
      await api.post("/checkins/", {
        booking_ref: booking.booking_ref,
        key_card_number: keyCard || undefined,
        remarks: remarks || undefined,
      });
      setBooking({ ...booking, status: "checked_in" });
      setTodayArrivals(prev => prev.filter(b => b.booking_ref !== booking.booking_ref));
      toast.success(`✓ Checked in — ${booking.booking_ref}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Check-in failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!booking) return;
    setActionLoading(true);
    try {
      await api.post(`/checkins/${booking.booking_ref}/checkout`, {
        remarks: remarks || undefined,
      });
      setBooking({ ...booking, status: "checked_out" });
      toast.success(`✓ Checked out — ${booking.booking_ref}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Check-out failed");
    } finally {
      setActionLoading(false);
    }
  };

  const statusColor: Record<string, string> = {
    confirmed:   "bg-blue-50 text-blue-700 border-blue-200",
    checked_in:  "bg-green-50 text-green-700 border-green-200",
    checked_out: "bg-gray-50 text-gray-600 border-gray-200",
    cancelled:   "bg-red-50 text-red-700 border-red-200",
    no_show:     "bg-orange-50 text-orange-700 border-orange-200",
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Search */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Booking ref e.g. RB-ABC123"
                value={ref}
                onChange={e => setRef(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && search()}
                className="pl-9 font-mono"
              />
            </div>
            <Button onClick={search} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </Button>
          </div>

          {booking && (
            <div className="mt-5 space-y-4">
              <div className={`flex items-start justify-between p-4 rounded-lg border ${statusColor[booking.status]}`}>
                <div>
                  <p className="text-lg font-bold font-mono">{booking.booking_ref}</p>
                  <p className="text-sm mt-0.5 opacity-80">
                    {booking.check_in_date} → {booking.check_out_date} ·{" "}
                    {booking.num_adults} adult{booking.num_adults > 1 ? "s" : ""}
                    {booking.num_children > 0 ? `, ${booking.num_children} children` : ""}
                  </p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded border">
                  {booking.status.replace(/_/g, " ")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Amount</p>
                  <p className="font-semibold text-base">₹{(booking.total_amount / 100).toLocaleString("en-IN")}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Amount Paid</p>
                  <p className="font-semibold text-base">₹{(booking.amount_paid / 100).toLocaleString("en-IN")}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Source</p>
                  <p className="font-medium capitalize">{booking.source.replace(/_/g, " ")}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Balance Due</p>
                  <p className={`font-semibold text-base ${booking.total_amount - booking.amount_paid > 0 ? "text-red-600" : "text-green-600"}`}>
                    ₹{((booking.total_amount - booking.amount_paid) / 100).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>

              {booking.special_requests && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <span className="font-semibold">Special requests: </span>{booking.special_requests}
                </div>
              )}

              {booking.status === "confirmed" && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Key Card Number</Label>
                      <Input placeholder="e.g. KC-204" value={keyCard} onChange={e => setKeyCard(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Remarks (optional)</Label>
                      <Input placeholder="Any notes..." value={remarks} onChange={e => setRemarks(e.target.value)} />
                    </div>
                  </div>
                  <Button onClick={handleCheckIn} disabled={actionLoading} className="bg-green-600 hover:bg-green-700 w-full">
                    <LogIn className="h-4 w-4 mr-2" />
                    {actionLoading ? "Processing..." : "Confirm Check-in"}
                  </Button>
                </div>
              )}

              {booking.status === "checked_in" && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Remarks (optional)</Label>
                    <Input placeholder="Any departure notes..." value={remarks} onChange={e => setRemarks(e.target.value)} />
                  </div>
                  <Button onClick={handleCheckOut} disabled={actionLoading} variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 w-full">
                    <LogOut className="h-4 w-4 mr-2" />
                    {actionLoading ? "Processing..." : "Confirm Check-out"}
                  </Button>
                </div>
              )}

              {booking.status === "checked_out" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                  <Clock className="h-4 w-4" />
                  <span>Guest has checked out. Stay complete.</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's arrivals */}
      {todayArrivals.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Expected Arrivals Today ({todayArrivals.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {todayArrivals.map(b => (
                <div
                  key={b.id}
                  className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => { setRef(b.booking_ref); setBooking(b); }}
                >
                  <div>
                    <p className="text-sm font-mono font-semibold">{b.booking_ref}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {b.num_adults} adult{b.num_adults > 1 ? "s" : ""} · ₹{(b.total_amount / 100).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">confirmed</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
