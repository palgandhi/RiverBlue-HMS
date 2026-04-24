"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { Booking, BookingStatus } from "@/types";
import Link from "next/link";

const statusColor: Record<BookingStatus, string> = {
  confirmed:   "bg-blue-100 text-blue-700",
  checked_in:  "bg-green-100 text-green-700",
  checked_out: "bg-gray-100 text-gray-600",
  cancelled:   "bg-red-100 text-red-700",
  no_show:     "bg-orange-100 text-orange-700",
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/bookings/?limit=100").then(r => setBookings(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = bookings.filter(b =>
    b.booking_ref.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bookings</h1>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No bookings found.</TableCell></TableRow>
              ) : filtered.map(b => (
                <TableRow key={b.id} className="cursor-pointer hover:bg-muted/40">
                  <TableCell className="font-mono text-sm font-medium">{b.booking_ref}</TableCell>
                  <TableCell className="text-sm">{b.check_in_date}</TableCell>
                  <TableCell className="text-sm">{b.check_out_date}</TableCell>
                  <TableCell className="text-sm">{b.num_adults + b.num_children}</TableCell>
                  <TableCell className="text-sm capitalize">{b.source.replace("_", " ")}</TableCell>
                  <TableCell className="text-sm font-medium">₹{(b.total_amount / 100).toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[b.status]}`}>
                      {b.status.replace("_", " ")}
                    </span>
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
