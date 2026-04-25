"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { toast } from "sonner";

interface Task {
  id: string;
  room_id: string;
  task_type: string;
  priority: string;
  status: string;
  notes: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
}

const priorityColor: Record<string, string> = {
  low:    "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-700",
  urgent: "bg-red-100 text-red-700",
};

const statusColor: Record<string, string> = {
  pending:     "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed:   "bg-green-100 text-green-700",
  skipped:     "bg-gray-100 text-gray-500",
};

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");

  useEffect(() => {
    const load = async () => {
      try {
        const roomsRes = await api.get("/rooms/");
        const roomMap: Record<string, string> = {};
        roomsRes.data.forEach((r: any) => { roomMap[r.id] = r.room_number; });
        setRooms(roomMap);

        // Generate tasks from rooms that need cleaning
        const cleaningRooms = roomsRes.data.filter((r: any) => r.status === "cleaning");
        const mockTasks: Task[] = cleaningRooms.map((r: any, i: number) => ({
          id: `task-${i}`,
          room_id: r.id,
          task_type: "daily_cleaning",
          priority: i % 3 === 0 ? "urgent" : "normal",
          status: "pending",
          notes: null,
          scheduled_at: null,
          completed_at: null,
        }));
        setTasks(mockTasks);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const updateStatus = (taskId: string, status: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    toast.success(`Task marked as ${status.replace("_", " ")}`);
  };

  const markRoomAvailable = async (roomId: string, taskId: string) => {
    try {
      await api.patch(`/rooms/${roomId}/status`, { status: "available" });
      updateStatus(taskId, "completed");
      toast.success("Room marked available");
    } catch {
      toast.error("Failed to update room");
    }
  };

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  if (loading) return <div className="text-sm text-muted-foreground">Loading tasks...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Housekeeping</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{tasks.filter(t => t.status === "pending").length} tasks pending</p>
      </div>

      <div className="flex gap-2">
        {["all", "pending", "in_progress", "completed"].map(s => (
          <Button key={s} variant={filter === s ? "default" : "outline"} size="sm"
            onClick={() => setFilter(s)} className="capitalize text-xs h-7">
            {s.replace("_", " ")}
            <span className="ml-1.5 opacity-70">
              {s === "all" ? tasks.length : tasks.filter(t => t.status === s).length}
            </span>
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {filter === "pending" ? "No pending tasks — all rooms are clean! 🎉" : "No tasks found."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(task => (
            <Card key={task.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-sm">Room {rooms[task.room_id] || task.room_id}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">
                      {task.task_type.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor[task.priority]}`}>
                      {task.priority}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[task.status]}`}>
                      {task.status.replace("_", " ")}
                    </span>
                  </div>
                </div>

                {task.notes && (
                  <p className="text-xs text-muted-foreground mb-3 bg-muted/50 rounded p-2">{task.notes}</p>
                )}

                {task.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-xs h-7 flex-1"
                      onClick={() => updateStatus(task.id, "in_progress")}>
                      Start
                    </Button>
                    <Button size="sm" className="text-xs h-7 flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => markRoomAvailable(task.room_id, task.id)}>
                      Done + Mark Available
                    </Button>
                  </div>
                )}
                {task.status === "in_progress" && (
                  <Button size="sm" className="text-xs h-7 w-full bg-green-600 hover:bg-green-700"
                    onClick={() => markRoomAvailable(task.room_id, task.id)}>
                    Complete + Mark Available
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
