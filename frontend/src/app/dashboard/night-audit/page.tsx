"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Moon, Play, CheckCircle, AlertCircle, Clock, TrendingUp, BedDouble, IndianRupee } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { format } from "date-fns";

interface NightAuditLog {
  id: string;
  business_date: string;
  status: string;
  total_rooms: number;
  occupied_rooms: number;
  room_revenue: number;
  total_revenue: number;
  new_bookings: number;
  checkins_count: number;
  checkouts_count: number;
  no_shows_count: number;
  adr: number;
  revpar: number;
  occupancy_pct: number;
  completed_at: string | null;
  run_by: string | null;
  notes: string | null;
}

interface TodayStats {
  business_date: string;
  audit_status: string;
  total_rooms: number;
  occupied_rooms: number;
  available_rooms: number;
  occupancy_pct: number;
  room_revenue: number;
  adr: number;
  revpar: number;
  checkins_today: number;
  checkouts_today: number;
  no_shows_today: number;
}

function fmt(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const statusIcon: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="h-4 w-4 text-green-600" />,
  skipped:   <AlertCircle className="h-4 w-4 text-orange-500" />,
  running:   <Clock className="h-4 w-4 text-blue-500 animate-spin" />,
};

export default function NightAuditPage() {
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [logs, setLogs] = useState<NightAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [todayRes, logsRes] = await Promise.all([
        api.get("/night-audit/stats/today"),
        api.get("/night-audit/logs?limit=30"),
      ]);
      setTodayStats(todayRes.data);
      setLogs(logsRes.data);
    } catch {
      toast.error("Failed to load audit data");
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const runAudit = async () => {
    setRunning(true);
    try {
      const res = await api.post("/night-audit/run");
      if (res.data.status === "completed") {
        toast.success(`Night audit completed for ${res.data.business_date}`);
      } else if (res.data.status === "skipped") {
        toast.info(res.data.message || "Audit already completed for today");
      }
      await loadData();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Audit failed");
    } finally { setRunning(false); }
  };

  const today = new Date().toISOString().split("T")[0];
  const todayAlreadyDone = logs.some(l => l.business_date === today && l.status === "completed");

  if (loading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header + run button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Moon className="h-5 w-5 text-primary" /> Night Audit
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Snapshot today&apos;s hotel stats, close the business day, and archive occupancy &amp; revenue data.
          </p>
        </div>
        <Button
          onClick={runAudit}
          disabled={running || todayAlreadyDone}
          className="gap-2 bg-indigo-600 hover:bg-indigo-700"
        >
          {running ? (
            <><Clock className="h-4 w-4 animate-spin" /> Running...</>
          ) : todayAlreadyDone ? (
            <><CheckCircle className="h-4 w-4" /> Done for Today</>
          ) : (
            <><Play className="h-4 w-4" /> Run Night Audit</>
          )}
        </Button>
      </div>

      {/* Today's live snapshot */}
      {todayStats && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Today — {format(new Date(), "dd MMMM yyyy")}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <BedDouble className="h-3.5 w-3.5" /> Occupancy
                </p>
                <p className="text-2xl font-bold text-primary mt-1">{todayStats.occupancy_pct}%</p>
                <p className="text-xs text-muted-foreground">{todayStats.occupied_rooms}/{todayStats.total_rooms} rooms</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <IndianRupee className="h-3.5 w-3.5" /> Room Revenue
                </p>
                <p className="text-2xl font-bold text-green-600 mt-1">{fmt(todayStats.room_revenue)}</p>
                 <p className="text-xs text-muted-foreground">today&apos;s room charges</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> ADR
                </p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(todayStats.adr)}</p>
                <p className="text-xs text-muted-foreground">avg daily rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Activity</p>
                <div className="flex gap-3 mt-2">
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{todayStats.checkins_today}</p>
                    <p className="text-xs text-muted-foreground">in</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-red-500">{todayStats.checkouts_today}</p>
                    <p className="text-xs text-muted-foreground">out</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-600">{todayStats.no_shows_today}</p>
                    <p className="text-xs text-muted-foreground">n/s</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Audit log history */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Audit Log History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Occ %</TableHead>
                <TableHead className="text-center">Rooms</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">ADR</TableHead>
                <TableHead className="text-right">RevPAR</TableHead>
                <TableHead className="text-center">C/I</TableHead>
                <TableHead className="text-center">C/O</TableHead>
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">
                    No audit logs yet. Run your first night audit above.
                  </TableCell>
                </TableRow>
              ) : logs.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium text-sm">
                    {format(new Date(log.business_date), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {statusIcon[log.status] || <Clock className="h-4 w-4 text-gray-400" />}
                      <span className="text-xs capitalize">{log.status}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span className={`font-semibold ${log.occupancy_pct >= 70 ? "text-green-600" : log.occupancy_pct >= 40 ? "text-amber-600" : "text-red-500"}`}>
                      {log.occupancy_pct}%
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-sm">{log.occupied_rooms}/{log.total_rooms}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{fmt(log.room_revenue)}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(log.adr)}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(log.revpar)}</TableCell>
                  <TableCell className="text-center text-sm text-green-600 font-medium">{log.checkins_count}</TableCell>
                  <TableCell className="text-center text-sm text-red-500 font-medium">{log.checkouts_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.completed_at ? format(new Date(log.completed_at), "HH:mm") : "—"}
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
