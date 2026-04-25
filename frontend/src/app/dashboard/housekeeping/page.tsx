"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Clock, CheckCircle, AlertCircle } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

interface Task {
  id: string;
  room_id: string;
  assigned_to: string | null;
  task_type: string;
  priority: string;
  status: string;
  notes: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
}

const priorityConfig: Record<string, { label: string; color: string }> = {
  low:    { label: "Low",    color: "bg-gray-100 text-gray-600" },
  normal: { label: "Normal", color: "bg-blue-100 text-blue-700" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700" },
};

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:     { label: "Pending",     color: "bg-amber-100 text-amber-700", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700",   icon: Sparkles },
  completed:   { label: "Completed",   color: "bg-green-100 text-green-700", icon: CheckCircle },
  skipped:     { label: "Skipped",     color: "bg-gray-100 text-gray-500",   icon: AlertCircle },
};

const taskTypeLabel: Record<string, string> = {
  checkout_cleaning: "Checkout Cleaning",
  daily_cleaning:    "Daily Cleaning",
  turndown:          "Turndown Service",
  maintenance:       "Maintenance",
  deep_clean:        "Deep Clean",
};

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");

  const loadTasks = async () => {
    try {
      const [tasksRes, roomsRes] = await Promise.all([
        api.get("/housekeeping/tasks"),
        api.get("/rooms/"),
      ]);
      setTasks(tasksRes.data);
      const roomMap: Record<string, string> = {};
      roomsRes.data.forEach((r: any) => { roomMap[r.id] = r.room_number; });
      setRooms(roomMap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTasks(); }, []);

  const updateTask = async (taskId: string, status: string) => {
    try {
      const res = await api.patch(`/housekeeping/tasks/${taskId}`, { status });
      setTasks(prev => prev.map(t => t.id === taskId ? res.data : t));
      if (status === "completed") toast.success("Task completed — room marked available");
      else toast.success(`Task ${status.replace("_", " ")}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to update task");
    }
  };

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);
  const counts = {
    all: tasks.length,
    pending: tasks.filter(t => t.status === "pending").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    completed: tasks.filter(t => t.status === "completed").length,
  };

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {counts.pending} pending · {counts.in_progress} in progress · {counts.completed} completed today
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadTasks} className="text-xs h-7">Refresh</Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "in_progress", "completed"] as const).map(s => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
            className="text-xs h-7 capitalize"
          >
            {s.replace("_", " ")}
            <span className="ml-1.5 opacity-70">{counts[s]}</span>
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium">
              {filter === "pending" ? "All caught up! No pending tasks." : "No tasks found."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(task => {
            const StatusIcon = statusConfig[task.status]?.icon || Clock;
            return (
              <Card key={task.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-sm">
                        Room {rooms[task.room_id] || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {taskTypeLabel[task.task_type] || task.task_type}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityConfig[task.priority]?.color}`}>
                        {priorityConfig[task.priority]?.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${statusConfig[task.status]?.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig[task.status]?.label}
                      </span>
                    </div>
                  </div>

                  {task.notes && (
                    <p className="text-xs bg-muted/60 rounded p-2 mb-3 text-muted-foreground">{task.notes}</p>
                  )}

                  {task.completed_at && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Completed: {new Date(task.completed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}

                  {task.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
                        onClick={() => updateTask(task.id, "in_progress")}>
                        Start
                      </Button>
                      <Button size="sm" className="flex-1 text-xs h-7 bg-green-600 hover:bg-green-700"
                        onClick={() => updateTask(task.id, "completed")}>
                        Mark Done
                      </Button>
                    </div>
                  )}
                  {task.status === "in_progress" && (
                    <Button size="sm" className="w-full text-xs h-7 bg-green-600 hover:bg-green-700"
                      onClick={() => updateTask(task.id, "completed")}>
                      <CheckCircle className="h-3 w-3 mr-1.5" /> Complete
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
