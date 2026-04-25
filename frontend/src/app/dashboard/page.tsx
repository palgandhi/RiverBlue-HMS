"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BedDouble, Users, Sparkles, TrendingUp } from "lucide-react";
import api from "@/lib/api";
import { Room, Booking } from "@/types";
import { useAuthStore } from "@/store/auth";

interface Stats {
  total: number;
  available: number;
  occupied: number;
  cleaning: number;
  maintenance: number;
}

function StatCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string | number; sub: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className={`p-2 rounded-lg bg-muted`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const statusColor: Record<string, string> = {
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

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats>({ total: 0, available: 0, occupied: 0, cleaning: 0, maintenance: 0 });
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [roomsRes, bookingsRes] = await Promise.all([
          api.get("/rooms/"),
          api.get("/bookings/?limit=8"),
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

  if (loading) return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {user?.full_name?.split(" ")[0]} 👋</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here is your hotel overview for today.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Occupancy" value={`${occupancyPct}%`} sub={`${stats.occupied} of ${stats.total} rooms`} icon={TrendingUp} color="text-primary" />
        <StatCard title="Available" value={stats.available} sub="ready to book" icon={BedDouble} color="text-green-600" />
        <StatCard title="Occupied" value={stats.occupied} sub="guests checked in" icon={Users} color="text-red-600" />
        <StatCard title="Cleaning" value={stats.cleaning} sub="being serviced" icon={Sparkles} color="text-amber-600" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recent Bookings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">No bookings yet.</p>
          ) : (
            <div className="divide-y">
              {recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm font-mono font-medium">{b.booking_ref}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {b.check_in_date} → {b.check_out_date} · {sourceLabel[b.source] || b.source}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">₹{(b.total_amount / 100).toLocaleString("en-IN")}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[b.status]}`}>
                      {b.status.replace(/_/g, " ")}
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
