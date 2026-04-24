"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { Room, RoomStatus } from "@/types";
import { toast } from "sonner";

const statusConfig: Record<RoomStatus, { label: string; color: string; bg: string }> = {
  available:    { label: "Available",    color: "text-green-700",  bg: "bg-green-50 border-green-200" },
  occupied:     { label: "Occupied",     color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  cleaning:     { label: "Cleaning",     color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  maintenance:  { label: "Maintenance",  color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  out_of_order: { label: "Out of Order", color: "text-gray-600",   bg: "bg-gray-50 border-gray-200" },
};

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RoomStatus | "all">("all");

  useEffect(() => {
    api.get("/rooms/").then(r => setRooms(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? rooms : rooms.filter(r => r.status === filter);
  const floors = [...new Set(filtered.map(r => r.floor))].sort();

  const updateStatus = async (roomId: string, status: RoomStatus) => {
    try {
      await api.patch(`/rooms/${roomId}/status`, { status });
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status } : r));
      toast.success("Room status updated");
    } catch {
      toast.error("Failed to update status");
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading rooms...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rooms</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{rooms.length} rooms across {[...new Set(rooms.map(r => r.floor))].length} floors</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "available", "occupied", "cleaning", "maintenance", "out_of_order"] as const).map(s => (
          <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)} className="capitalize text-xs h-7">
            {s === "all" ? "All" : statusConfig[s].label}
            <span className="ml-1.5 text-xs opacity-70">
              {s === "all" ? rooms.length : rooms.filter(r => r.status === s).length}
            </span>
          </Button>
        ))}
      </div>

      {floors.map(floor => (
        <div key={floor}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Floor {floor}</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {filtered.filter(r => r.floor === floor).map(room => {
              const cfg = statusConfig[room.status];
              return (
                <div
                  key={room.id}
                  className={`border rounded-lg p-2 text-center cursor-pointer hover:shadow-sm transition-shadow ${cfg.bg}`}
                  onClick={() => {
                    const next = room.status === "available" ? "cleaning" :
                                 room.status === "cleaning" ? "available" : room.status;
                    if (next !== room.status) updateStatus(room.id, next);
                  }}
                >
                  <p className={`text-sm font-semibold ${cfg.color}`}>{room.room_number}</p>
                  <p className={`text-xs mt-0.5 ${cfg.color} opacity-80`}>{cfg.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
