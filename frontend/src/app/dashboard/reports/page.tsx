"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, BedDouble, IndianRupee, BarChart3 } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from "recharts";
import api from "@/lib/api";
import { format, parseISO } from "date-fns";

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
  status: string;
  source: string;
  total_amount: number;
  check_in_date: string;
}

function fmt(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function KpiCard({ title, value, sub, delta, icon: Icon, color }: {
  title: string; value: string; sub: string; delta?: string;
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
            {delta && <p className="text-xs text-green-600 font-medium mt-0.5">{delta}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const COLORS = ["#6366f1", "#22c55e", "#ef4444", "#f97316", "#a855f7", "#14b8a6", "#eab308", "#64748b"];

const sourceLabel: Record<string, string> = {
  direct: "Direct", walk_in: "Walk-in", makemytrip: "MakeMyTrip",
  ixigo: "Ixigo", booking_com: "Booking.com", expedia: "Expedia",
  phone: "Phone", other: "Other",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border rounded-lg shadow-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-muted-foreground">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {entry.name.includes("Revenue") || entry.name.includes("ADR") || entry.name.includes("RevPAR")
            ? fmt(entry.value)
            : entry.name.includes("Occupancy") ? `${entry.value}%` : entry.value}
        </p>
      ))}
    </div>
  );
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
      setStats(s.data.reverse());
      setBookings(b.data);
    }).finally(() => setLoading(false));
  }, []);

  const chartData = stats.map(s => ({
    date: format(parseISO(s.business_date), "dd MMM"),
    "Room Revenue": Math.round(s.room_revenue / 100),
    "Occupancy %": s.occupancy_pct,
    "ADR": Math.round(s.adr / 100),
    "RevPAR": Math.round(s.revpar / 100),
    "New Bookings": s.new_bookings,
    "Check-ins": s.checkins_count,
    "Check-outs": s.checkouts_count,
  }));

  const today = stats[stats.length - 1];
  const yesterday = stats[stats.length - 2];
  const totalRevenue30 = stats.reduce((a, s) => a + s.room_revenue, 0);
  const avgOccupancy30 = stats.length > 0 ? Math.round(stats.reduce((a, s) => a + s.occupancy_pct, 0) / stats.length) : 0;
  const totalBookings30 = stats.reduce((a, s) => a + s.new_bookings, 0);

  // Source breakdown
  const sourceCounts: Record<string, { count: number; revenue: number }> = {};
  bookings.forEach(b => {
    if (!sourceCounts[b.source]) sourceCounts[b.source] = { count: 0, revenue: 0 };
    sourceCounts[b.source].count++;
    sourceCounts[b.source].revenue += b.total_amount;
  });
  const sourceChartData = Object.entries(sourceCounts)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([source, data]) => ({ name: sourceLabel[source] || source, value: data.count, revenue: Math.round(data.revenue / 100) }));

  const statusCounts: Record<string, number> = {};
  bookings.forEach(b => { statusCounts[b.status] = (statusCounts[b.status] || 0) + 1; });
  const statusPieData = Object.entries(statusCounts).map(([status, count]) => ({
    name: status.replace(/_/g, " "), value: count
  }));

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
          <TabsTrigger value="occupancy" className="text-xs h-7">Occupancy</TabsTrigger>
          <TabsTrigger value="bookings" className="text-xs h-7">Bookings</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="space-y-5 mt-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Today</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard title="Occupancy" value={today ? `${today.occupancy_pct}%` : "—"}
                sub={today ? `${today.occupied_rooms}/${today.total_rooms} rooms` : "Run night audit"}
                delta={yesterday ? `${today.occupancy_pct > yesterday.occupancy_pct ? "+" : ""}${today.occupancy_pct - yesterday.occupancy_pct}% vs yesterday` : undefined}
                icon={BedDouble} color="text-primary" />
              <KpiCard title="Room Revenue" value={today ? fmt(today.room_revenue) : "—"}
                sub="from room charges"
                delta={yesterday && today ? `${today.room_revenue >= yesterday.room_revenue ? "↑" : "↓"} vs yesterday` : undefined}
                icon={IndianRupee} color="text-green-600" />
              <KpiCard title="ADR" value={today ? fmt(today.adr) : "—"} sub="avg daily rate" icon={TrendingUp} color="text-blue-600" />
              <KpiCard title="RevPAR" value={today ? fmt(today.revpar) : "—"} sub="rev per avail room" icon={BarChart3} color="text-purple-600" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">30d Revenue</p>
              <p className="text-xl font-bold text-green-600 mt-1">{fmt(totalRevenue30)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Occupancy</p>
              <p className="text-xl font-bold text-primary mt-1">{avgOccupancy30}%</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">New Bookings</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{totalBookings30}</p>
            </CardContent></Card>
          </div>

          {today && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Today's Activity</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-3xl font-bold text-green-600">{today.checkins_count}</p>
                    <p className="text-xs text-muted-foreground mt-1">Check-ins</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-red-500">{today.checkouts_count}</p>
                    <p className="text-xs text-muted-foreground mt-1">Check-outs</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-amber-600">{today.no_shows_count}</p>
                    <p className="text-xs text-muted-foreground mt-1">No-shows</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── REVENUE ── */}
        <TabsContent value="revenue" className="space-y-5 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Daily Room Revenue — Last 30 Days</CardTitle></CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No data yet. Run the night audit to generate stats.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={1} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={50} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="Room Revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">ADR Trend (₹)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData.slice(-14)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${v}`} width={55} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="ADR" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="RevPAR" stroke="#a855f7" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Revenue by Source</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={sourceChartData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={72} />
                      <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString("en-IN")}`, "Revenue"]} />
                    <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                      {sourceChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── OCCUPANCY ── */}
        <TabsContent value="occupancy" className="space-y-5 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Occupancy % — Last 30 Days</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="Occupancy %" stroke="#22c55e" strokeWidth={2} fill="url(#occGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Daily Activity — Last 14 Days</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData.slice(-14)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="Check-ins" fill="#22c55e" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Check-outs" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="New Bookings" fill="#6366f1" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BOOKINGS ── */}
        <TabsContent value="bookings" className="space-y-5 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Bookings by Source</CardTitle></CardHeader>
              <CardContent className="flex justify-center">
                {sourceChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={sourceChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
                        {sourceChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => [Number(v), "Bookings"]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground py-10">No bookings yet.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Booking Status</CardTitle></CardHeader>
              <CardContent className="flex justify-center">
                {statusPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={statusPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
                        {statusPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => [Number(v), "Bookings"]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground py-10">No bookings yet.</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Revenue by Source</CardTitle></CardHeader>
            <CardContent className="divide-y">
              {sourceChartData.map((s, i) => (
                <div key={s.name} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-sm">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">{s.value} booking{s.value !== 1 ? "s" : ""}</span>
                    <span className="font-semibold">₹{s.revenue.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
