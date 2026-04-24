"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { Room, Booking } from "@/types";

interface Stats {
  total: number;
  available: number;
  occupied: number;
  cleaning: number;
  maintenance: number;
}

function StatCard({ title, value, sub, color }: { title: string; value: number; sub: string; color: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${color}`}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, available: 0, occupied: 0, cleaning: 0, maintenance: 0 });
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [roomsRes, bookingsRes] = await Promise.all([
          api.get("/rooms/"),
          api.get("/bookings/?limit=5"),
        ]);
        const rooms: Room[] = roomsRes.data;
        setStats({
          total: rooms.length,
          available: rooms.filter(r => r.status === "available").length,
          occupied: rooms.filter(r => r.status === "occupied").length,
          cleaning: rooms.filter(r => r.status === "cleaning").length,
          maintenance: rooms.filter(r => r.status === "maintenance").length,
        });
        setRecentBookings(bookingsRes.data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const occupancyPct = stats.total ? Math.round((stats.occupied / stats.total) * 100) : 0;

  const statusColor: Record<string, string> = {
    confirmed: "bg-blue-100 text-blue-700",
    checked_in: "bg-green-100 text-green-700",
    checked_out: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-700",
    no_show: "bg-orange-100 text-orange-700",
  };

  if (loading) return <div className="text-muted-foreground text-sm">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Hotel overview for today</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Occupancy" value={occupancyPct} sub={`${stats.occupied} of ${stats.total} rooms`} color="text-primary" />
        <StatCard title="Available" value={stats.available} sub="ready to book" color="text-green-600" />
        <StatCard title="Occupied" value={stats.occupied} sub="guests checked in" color="text-red-600" />
        <StatCard title="Cleaning" value={stats.cleaning} sub="being serviced" color="text-amber-600" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {recentBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <div className="space-y-3">
              {recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{b.booking_ref}</p>
                    <p className="text-xs text-muted-foreground">{b.check_in_date} → {b.check_out_date}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">₹{(b.total_amount / 100).toLocaleString()}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[b.status]}`}>
                      {b.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
