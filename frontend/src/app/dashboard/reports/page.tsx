"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, BedDouble, IndianRupee, BarChart3, Users, Calendar } from "lucide-react";
import api from "@/lib/api";

interface DailyStats {
  business_date: string;
  total_rooms: number;
  occupied_rooms: number;
  available_rooms: number;
  occupancy_pct: number;
  room_revenue: number;
  total_revenue: number;
  new_bookings: number;
  checkins_count: number;
  checkouts_count: number;
  no_shows_count: number;
  adr: number;
  revpar: number;
}

interface Booking {
  id: string;
  booking_ref: string;
  status: string;
  source: string;
  total_amount: number;
  check_in_date: string;
  check_out_date: string;
  created_at: string;
}

function fmt(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function KpiCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string; sub: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SimpleBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

const sourceLabel: Record<string, string> = {
  direct: "Direct", walk_in: "Walk-in", makemytrip: "MakeMyTrip",
  ixigo: "Ixigo", booking_com: "Booking.com", expedia: "Expedia",
  phone: "Phone", other: "Other",
};

const sourceColor: Record<string, string> = {
  direct: "bg-blue-500", walk_in: "bg-green-500", makemytrip: "bg-red-500",
  ixigo: "bg-orange-500", booking_com: "bg-purple-500", expedia: "bg-yellow-500",
  phone: "bg-teal-500", other: "bg-gray-400",
};

export default function ReportsPage() {
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/night-audit/stats?days=30"),
      api.get("/bookings/?limit=200"),
    ]).then(([s, b]) => {
      setStats(s.data.reverse()); // oldest first for charts
      setBookings(b.data);
    }).finally(() => setLoading(false));
  }, []);

  const today = stats[stats.length - 1];
  const yesterday = stats[stats.length - 2];

  const totalRevenue30 = stats.reduce((a, s) => a + s.room_revenue, 0);
  const avgOccupancy30 = stats.length > 0
    ? Math.round(stats.reduce((a, s) => a + s.occupancy_pct, 0) / stats.length)
    : 0;
  const totalBookings30 = stats.reduce((a, s) => a + s.new_bookings, 0);

  // Source breakdown from bookings
  const sourceCounts: Record<string, { count: number; revenue: number }> = {};
  bookings.forEach(b => {
    if (!sourceCounts[b.source]) sourceCounts[b.source] = { count: 0, revenue: 0 };
    sourceCounts[b.source].count++;
    sourceCounts[b.source].revenue += b.total_amount;
  });
  const maxSourceCount = Math.max(...Object.values(sourceCounts).map(s => s.count), 1);

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  bookings.forEach(b => {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
  });

  const maxRevenue = Math.max(...stats.map(s => s.room_revenue), 1);

  if (loading) return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview">
        <TabsList className="h-8">
          <TabsTrigger value="overview" className="text-xs h-7">Overview</TabsTrigger>
          <TabsTrigger value="revenue" className="text-xs h-7">Revenue</TabsTrigger>
          <TabsTrigger value="bookings" className="text-xs h-7">Bookings</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ── */}
        <TabsContent value="overview" className="space-y-5 mt-4">

          {/* Today KPIs */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Today</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                title="Occupancy"
                value={today ? `${today.occupancy_pct}%` : "—"}
                sub={today ? `${today.occupied_rooms} of ${today.total_rooms} rooms` : "Run night audit"}
                icon={BedDouble} color="text-primary"
              />
              <KpiCard
                title="Room Revenue"
                value={today ? fmt(today.room_revenue) : "—"}
                sub="from room charges"
                icon={IndianRupee} color="text-green-600"
              />
              <KpiCard
                title="ADR"
                value={today ? fmt(today.adr) : "—"}
                sub="avg daily rate"
                icon={TrendingUp} color="text-blue-600"
              />
              <KpiCard
                title="RevPAR"
                value={today ? fmt(today.revpar) : "—"}
                sub="rev per available room"
                icon={BarChart3} color="text-purple-600"
              />
            </div>
          </div>

          {/* 30-day summary */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Last 30 Days</p>
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Revenue</p>
                  <p className="text-xl font-bold text-green-600 mt-1">{fmt(totalRevenue30)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Occupancy</p>
                  <p className="text-xl font-bold text-primary mt-1">{avgOccupancy30}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">New Bookings</p>
                  <p className="text-xl font-bold text-blue-600 mt-1">{totalBookings30}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Today activity */}
          {today && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Today's Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{today.checkins_count}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Check-ins</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">{today.checkouts_count}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Check-outs</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600">{today.no_shows_count}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">No-shows</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── REVENUE TAB ── */}
        <TabsContent value="revenue" className="space-y-5 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Daily Room Revenue — Last 30 Days</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No data yet. Run the night audit to generate stats.</p>
              ) : (
                <div className="space-y-2">
                  {stats.slice(-14).map(s => (
                    <div key={s.business_date} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">
                        {new Date(s.business_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                      <div className="flex-1 bg-muted rounded-full h-4 relative">
                        <div
                          className="h-4 rounded-full bg-primary/80 flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(4, (s.room_revenue / maxRevenue) * 100)}%` }}
                        >
                          {s.room_revenue > 0 && (
                            <span className="text-xs text-white font-medium">{fmt(s.room_revenue)}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground w-8 shrink-0">{s.occupancy_pct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Occupancy Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.slice(-7).map(s => (
                    <div key={s.business_date} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {new Date(s.business_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </span>
                        <span className="font-medium">{s.occupancy_pct}%</span>
                      </div>
                      <SimpleBar value={s.occupancy_pct} max={100} color="bg-primary" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">ADR vs RevPAR</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.slice(-5).map(s => (
                    <div key={s.business_date} className="text-xs">
                      <div className="flex justify-between text-muted-foreground mb-1">
                        <span>{new Date(s.business_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                        <span>ADR {fmt(s.adr)} · RevPAR {fmt(s.revpar)}</span>
                      </div>
                      <SimpleBar value={s.revpar} max={s.adr || 1} color="bg-purple-500" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── BOOKINGS TAB ── */}
        <TabsContent value="bookings" className="space-y-5 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Bookings by Source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(sourceCounts)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([source, data]) => (
                    <div key={source} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${sourceColor[source] || "bg-gray-400"}`} />
                          <span>{sourceLabel[source] || source}</span>
                        </div>
                        <span className="text-muted-foreground">{data.count} bookings · {fmt(data.revenue)}</span>
                      </div>
                      <SimpleBar value={data.count} max={maxSourceCount} color={sourceColor[source] || "bg-gray-400"} />
                    </div>
                  ))}
                {Object.keys(sourceCounts).length === 0 && (
                  <p className="text-sm text-muted-foreground">No bookings yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Booking Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(statusCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => {
                    const colors: Record<string, string> = {
                      confirmed: "bg-blue-500", checked_in: "bg-green-500",
                      checked_out: "bg-gray-400", cancelled: "bg-red-500", no_show: "bg-orange-500"
                    };
                    return (
                      <div key={status} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="capitalize">{status.replace(/_/g, " ")}</span>
                          <span className="text-muted-foreground">{count}</span>
                        </div>
                        <SimpleBar value={count} max={bookings.length} color={colors[status] || "bg-gray-400"} />
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Revenue by Source</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {Object.entries(sourceCounts)
                  .sort((a, b) => b[1].revenue - a[1].revenue)
                  .map(([source, data]) => (
                    <div key={source} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${sourceColor[source] || "bg-gray-400"}`} />
                        <span className="text-sm">{sourceLabel[source] || source}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">{data.count} booking{data.count !== 1 ? "s" : ""}</span>
                        <span className="font-semibold">{fmt(data.revenue)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
