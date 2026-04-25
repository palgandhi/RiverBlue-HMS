"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, LogIn, LogOut, Clock, Users } from "lucide-react";
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
  const [inHouseGuests, setInHouseGuests] = useState<Booking[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const loadLists = async () => {
    setListLoading(true);
    try {
      const res = await api.get("/bookings/?limit=200");
      const today = new Date().toISOString().split("T")[0];
      setTodayArrivals(res.data.filter((b: Booking) =>
        b.check_in_date === today && b.status === "confirmed"
      ));
      setInHouseGuests(res.data.filter((b: Booking) =>
        b.status === "checked_in"
      ));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => { loadLists(); }, []);

  const search = async (searchRef?: string) => {
    const r = (searchRef || ref).trim().toUpperCase();
    if (!r) return;
    setLoading(true);
    setBooking(null);
    setKeyCard("");
    setRemarks("");
    try {
      const res = await api.get(`/bookings/${r}`);
      setBooking(res.data);
      setRef(r);
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
      const updated = { ...booking, status: "checked_in" as const };
      setBooking(updated);
      setTodayArrivals(prev => prev.filter(b => b.booking_ref !== booking.booking_ref));
      setInHouseGuests(prev => [...prev, updated]);
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
      const updated = { ...booking, status: "checked_out" as const };
      setBooking(updated);
      setInHouseGuests(prev => prev.filter(b => b.booking_ref !== booking.booking_ref));
      toast.success(`✓ Checked out — ${booking.booking_ref}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Check-out failed");
    } finally {
      setActionLoading(false);
    }
  };

  const statusStyle: Record<string, string> = {
    confirmed:   "bg-blue-50 text-blue-700 border-blue-200",
    checked_in:  "bg-green-50 text-green-700 border-green-200",
    checked_out: "bg-gray-50 text-gray-500 border-gray-200",
    cancelled:   "bg-red-50 text-red-700 border-red-200",
    no_show:     "bg-orange-50 text-orange-700 border-orange-200",
  };

  const BookingCard = ({ b, onClick }: { b: Booking; onClick: () => void }) => (
    <div
      className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div>
        <p className="text-sm font-mono font-semibold">{b.booking_ref}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {b.check_in_date} → {b.check_out_date} ·{" "}
          {b.num_adults} adult{b.num_adults > 1 ? "s" : ""}
          {b.num_children > 0 ? `, ${b.num_children} child` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">₹{(b.total_amount / 100).toLocaleString("en-IN")}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusStyle[b.status]}`}>
          {b.status.replace(/_/g, " ")}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Search bar */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search booking ref — RB-ABC123"
                value={ref}
                onChange={e => setRef(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && search()}
                className="pl-9 font-mono"
              />
            </div>
            <Button onClick={() => search()} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </Button>
          </div>

          {/* Booking detail */}
          {booking && (
            <div className="mt-5 space-y-4">
              <div className={`flex items-start justify-between p-4 rounded-lg border ${statusStyle[booking.status]}`}>
                <div>
                  <p className="text-lg font-bold font-mono">{booking.booking_ref}</p>
                  <p className="text-sm mt-0.5 opacity-80">
                    {booking.check_in_date} → {booking.check_out_date} · {booking.num_adults} adult{booking.num_adults > 1 ? "s" : ""}
                    {booking.num_children > 0 ? `, ${booking.num_children} children` : ""}
                  </p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded border">
                  {booking.status.replace(/_/g, " ")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Amount</p>
                  <p className="font-semibold text-base mt-0.5">₹{(booking.total_amount / 100).toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Balance Due</p>
                  <p className={`font-semibold text-base mt-0.5 ${booking.total_amount - booking.amount_paid > 0 ? "text-red-600" : "text-green-600"}`}>
                    ₹{((booking.total_amount - booking.amount_paid) / 100).toLocaleString("en-IN")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Source</p>
                  <p className="font-medium capitalize mt-0.5">{booking.source.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Amount Paid</p>
                  <p className="font-semibold mt-0.5">₹{(booking.amount_paid / 100).toLocaleString("en-IN")}</p>
                </div>
              </div>

              {booking.special_requests && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <span className="font-semibold">Special requests: </span>{booking.special_requests}
                </div>
              )}

              {booking.status === "confirmed" && (
                <div className="space-y-3 pt-3 border-t">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Key Card Number</Label>
                      <Input placeholder="e.g. KC-204" value={keyCard} onChange={e => setKeyCard(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Remarks</Label>
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
                <div className="space-y-3 pt-3 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Departure Remarks</Label>
                    <Input placeholder="Any departure notes..." value={remarks} onChange={e => setRemarks(e.target.value)} />
                  </div>
                  <Button onClick={handleCheckOut} disabled={actionLoading} variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 w-full">
                    <LogOut className="h-4 w-4 mr-2" />
                    {actionLoading ? "Processing..." : "Confirm Check-out"}
                  </Button>
                </div>
              )}

              {booking.status === "checked_out" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-3 border-t">
                  <Clock className="h-4 w-4" />
                  <span>Guest has checked out successfully.</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Arrivals / In-house tabs */}
      <Tabs defaultValue="arrivals">
        <TabsList className="h-8">
          <TabsTrigger value="arrivals" className="text-xs h-7">
            <Clock className="h-3 w-3 mr-1.5" />
            Today&apos;s Arrivals ({todayArrivals.length})
          </TabsTrigger>
          <TabsTrigger value="inhouse" className="text-xs h-7">
            <Users className="h-3 w-3 mr-1.5" />
            In-House ({inHouseGuests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="arrivals" className="mt-3">
          <Card>
            <CardContent className="p-0">
              {listLoading ? (
                <p className="text-sm text-muted-foreground px-5 py-4">Loading...</p>
              ) : todayArrivals.length === 0 ? (
                <p className="text-sm text-muted-foreground px-5 py-4">No arrivals expected today.</p>
              ) : (
                <div className="divide-y">
                  {todayArrivals.map(b => (
                    <BookingCard key={b.id} b={b} onClick={() => search(b.booking_ref)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inhouse" className="mt-3">
          <Card>
            <CardContent className="p-0">
              {listLoading ? (
                <p className="text-sm text-muted-foreground px-5 py-4">Loading...</p>
              ) : inHouseGuests.length === 0 ? (
                <p className="text-sm text-muted-foreground px-5 py-4">No guests currently checked in.</p>
              ) : (
                <div className="divide-y">
                  {inHouseGuests.map(b => (
                    <BookingCard key={b.id} b={b} onClick={() => search(b.booking_ref)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
