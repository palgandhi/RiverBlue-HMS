"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { Room, RoomStatus } from "@/types";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth";

const statusConfig: Record<RoomStatus, { label: string; color: string; bg: string; dot: string }> = {
  available:    { label: "Available",    color: "text-green-700",  bg: "bg-green-50 border-green-200",   dot: "bg-green-500" },
  occupied:     { label: "Occupied",     color: "text-red-700",    bg: "bg-red-50 border-red-200",       dot: "bg-red-500" },
  cleaning:     { label: "Cleaning",     color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",   dot: "bg-amber-500" },
  maintenance:  { label: "Maintenance",  color: "text-purple-700", bg: "bg-purple-50 border-purple-200", dot: "bg-purple-500" },
  out_of_order: { label: "Out of Order", color: "text-gray-600",   bg: "bg-gray-100 border-gray-300",    dot: "bg-gray-500" },
};

const STATUS_TRANSITIONS: Record<RoomStatus, RoomStatus[]> = {
  available:    ["cleaning", "maintenance", "out_of_order"],
  occupied:     ["maintenance"],
  cleaning:     ["available", "maintenance", "out_of_order"],
  maintenance:  ["available", "out_of_order"],
  out_of_order: ["maintenance", "available"],
};

const ADMIN_ONLY: RoomStatus[] = ["out_of_order"];

interface RoomType {
  id: string;
  name: string;
  base_price_per_night: number;
}

export default function RoomsPage() {
  const { user } = useAuthStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<Record<string, RoomType>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RoomStatus | "all">("all");
  const [selected, setSelected] = useState<Room | null>(null);
  const [newStatus, setNewStatus] = useState<RoomStatus | "">("");
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/rooms/"), api.get("/rooms/types")]).then(([r, t]) => {
      setRooms(r.data);
      const map: Record<string, RoomType> = {};
      t.data.forEach((rt: RoomType) => { map[rt.id] = rt; });
      setRoomTypes(map);
    }).finally(() => setLoading(false));
  }, []);

  const counts = {
    all:          rooms.length,
    available:    rooms.filter(r => r.status === "available").length,
    occupied:     rooms.filter(r => r.status === "occupied").length,
    cleaning:     rooms.filter(r => r.status === "cleaning").length,
    maintenance:  rooms.filter(r => r.status === "maintenance").length,
    out_of_order: rooms.filter(r => r.status === "out_of_order").length,
  };

  const filtered = filter === "all" ? rooms : rooms.filter(r => r.status === filter);
  const floors = [...new Set(filtered.map(r => r.floor))].sort((a, b) => a - b);

  const openDialog = (room: Room) => {
    setSelected(room);
    setNewStatus("");
    setNotes(room.notes || "");
  };

  const handleUpdate = async () => {
    if (!selected || !newStatus) return;
    setUpdating(true);
    try {
      const res = await api.patch(`/rooms/${selected.id}/status`, {
        status: newStatus,
        notes: notes || undefined,
      });
      setRooms(prev => prev.map(r => r.id === selected.id ? { ...r, status: res.data.status, notes: notes } : r));
      toast.success(`Room ${selected.room_number} → ${statusConfig[newStatus].label}`);
      setSelected(null);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to update room");
    } finally {
      setUpdating(false);
    }
  };

  const allowedTransitions = selected
    ? STATUS_TRANSITIONS[selected.status].filter(s =>
        !(ADMIN_ONLY.includes(s) && user?.role !== "admin")
      )
    : [];

  if (loading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {(Object.keys(statusConfig) as RoomStatus[]).map(s => (
          <Card
            key={s}
            className={`cursor-pointer transition-all hover:shadow-sm ${filter === s ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter(filter === s ? "all" : s)}
          >
            <CardContent className="p-3 text-center">
              <div className={`text-xl font-bold ${statusConfig[s].color}`}>{counts[s]}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{statusConfig[s].label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap items-center">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm" className="text-xs h-7"
          onClick={() => setFilter("all")}
        >
          All <span className="ml-1.5 opacity-70">{counts.all}</span>
        </Button>
        {(Object.keys(statusConfig) as RoomStatus[]).map(s => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm" className="text-xs h-7"
            onClick={() => setFilter(filter === s ? "all" : s)}
          >
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${statusConfig[s].dot}`} />
            {statusConfig[s].label}
            <span className="ml-1.5 opacity-70">{counts[s]}</span>
          </Button>
        ))}
      </div>

      {/* Room grid by floor */}
      {floors.map(floor => (
        <div key={floor}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Floor {floor}
            <span className="ml-2 font-normal">({filtered.filter(r => r.floor === floor).length} rooms)</span>
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {filtered.filter(r => r.floor === floor).map(room => {
              const cfg = statusConfig[room.status];
              const rt = roomTypes[room.room_type_id];
              return (
                <div
                  key={room.id}
                  className={`border rounded-lg p-2 text-center cursor-pointer hover:shadow-md transition-all select-none ${cfg.bg}`}
                  onClick={() => openDialog(room)}
                  title={`${rt?.name || ""} — Click to manage`}
                >
                  <p className={`text-sm font-bold ${cfg.color}`}>{room.room_number}</p>
                  <p className={`text-xs mt-0.5 ${cfg.color} opacity-75`}>{cfg.label}</p>
                  {room.notes && (
                    <p className="text-xs mt-0.5 opacity-50 truncate" title={room.notes}>📌</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Room action dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-sm bg-card border shadow-xl">
          <DialogHeader>
            <DialogTitle>Room {selected?.room_number}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 mt-2">
              {/* Current status */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${statusConfig[selected.status].bg} ${statusConfig[selected.status].color}`}>
                <span className={`w-2 h-2 rounded-full ${statusConfig[selected.status].dot}`} />
                Currently: {statusConfig[selected.status].label}
              </div>

              {/* Room info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="font-medium mt-0.5">{roomTypes[selected.room_type_id]?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rate / night</p>
                  <p className="font-medium mt-0.5">
                    ₹{((roomTypes[selected.room_type_id]?.base_price_per_night || 0) / 100).toLocaleString("en-IN")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Floor</p>
                  <p className="font-medium mt-0.5">{selected.floor}</p>
                </div>
              </div>

              {selected.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                  <span className="font-medium">Note: </span>{selected.notes}
                </div>
              )}

              {/* Change status */}
              {allowedTransitions.length > 0 ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Change Status To</Label>
                    <Select value={newStatus} onValueChange={v => setNewStatus(v as RoomStatus)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select new status..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedTransitions.map(s => (
                          <SelectItem key={s} value={s}>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${statusConfig[s].dot}`} />
                              {statusConfig[s].label}
                              {ADMIN_ONLY.includes(s) && (
                                <span className="text-xs text-muted-foreground">(admin only)</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notes (optional)</Label>
                    <Input
                      placeholder="e.g. AC not working, scheduled for repair"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      disabled={!newStatus || updating}
                      onClick={handleUpdate}
                    >
                      {updating ? "Updating..." : "Update Status"}
                    </Button>
                    <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No status changes available for this room.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
