"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { Booking, BookingStatus } from "@/types";
import Link from "next/link";
import { toast } from "sonner";

const statusColor: Record<BookingStatus, string> = {
  confirmed:   "bg-blue-100 text-blue-700",
  checked_in:  "bg-green-100 text-green-700",
  checked_out: "bg-gray-100 text-gray-500",
  cancelled:   "bg-red-100 text-red-700",
  no_show:     "bg-orange-100 text-orange-700",
};

const sourceLabel: Record<string, string> = {
  direct: "Direct", walk_in: "Walk-in", makemytrip: "MakeMyTrip",
  ixigo: "Ixigo", booking_com: "Booking.com", expedia: "Expedia",
  phone: "Phone", other: "Other",
};

export default function BookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/bookings/?limit=100")
      .then(r => setBookings(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = bookings.filter(b =>
    b.booking_ref.toLowerCase().includes(search.toLowerCase())
  );

  const handleCancel = async (e: React.MouseEvent, b: Booking) => {
    e.stopPropagation();
    if (!confirm(`Cancel booking ${b.booking_ref}? This cannot be undone.`)) return;
    try {
      await api.post(`/bookings/${b.booking_ref}/cancel`);
      setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: "cancelled" as BookingStatus } : x));
      toast.success(`${b.booking_ref} cancelled`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to cancel");
    }
  };

  const handleNoShow = async (e: React.MouseEvent, b: Booking) => {
    e.stopPropagation();
    if (!confirm(`Mark ${b.booking_ref} as no-show?`)) return;
    try {
      await api.post(`/bookings/${b.booking_ref}/no-show`);
      setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: "no_show" as BookingStatus } : x));
      toast.success(`${b.booking_ref} marked as no-show`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">{bookings.length} total bookings</p>
        </div>
        <Link href="/dashboard/bookings/new">
          <Button size="sm">+ New Booking</Button>
        </Link>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search by booking ref..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Guests</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No bookings found.</TableCell>
                </TableRow>
              ) : filtered.map(b => (
                <TableRow
                  key={b.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => router.push(`/dashboard/billing?booking_id=${b.id}&ref=${b.booking_ref}`)}
                >
                  <TableCell className="font-mono text-sm font-medium">{b.booking_ref}</TableCell>
                  <TableCell className="text-sm">{b.check_in_date}</TableCell>
                  <TableCell className="text-sm">{b.check_out_date}</TableCell>
                  <TableCell className="text-sm">{b.num_adults + b.num_children}</TableCell>
                  <TableCell className="text-sm">{sourceLabel[b.source] || b.source}</TableCell>
                  <TableCell className="text-sm font-medium">₹{(b.total_amount / 100).toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[b.status]}`}>
                      {b.status.replace(/_/g, " ")}
                    </span>
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    {b.status === "confirmed" && (
                      <div className="flex gap-1.5">
                        <button
                          className="text-xs px-2 py-0.5 rounded border border-orange-200 text-orange-600 hover:bg-orange-50 whitespace-nowrap"
                          onClick={e => handleNoShow(e, b)}
                        >
                          No-show
                        </button>
                        <button
                          className="text-xs px-2 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                          onClick={e => handleCancel(e, b)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
