"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { addDays, format, startOfWeek, addWeeks, subWeeks, isSameDay, parseISO } from "date-fns";

interface Booking {
  id: string;
  booking_ref: string;
  room_id: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  num_adults: number;
  total_amount: number;
}

interface Room {
  id: string;
  room_number: string;
  floor: number;
  status: string;
  room_type_id: string;
}

interface RoomType {
  id: string;
  name: string;
}

const statusColors: Record<string, string> = {
  confirmed:   "bg-blue-500",
  checked_in:  "bg-green-500",
  checked_out: "bg-gray-400",
  cancelled:   "bg-red-300",
  no_show:     "bg-orange-400",
};

const statusBg: Record<string, string> = {
  confirmed:   "bg-blue-50 border-blue-300 text-blue-800",
  checked_in:  "bg-green-50 border-green-300 text-green-800",
  checked_out: "bg-gray-50 border-gray-300 text-gray-600",
  cancelled:   "bg-red-50 border-red-200 text-red-600",
  no_show:     "bg-orange-50 border-orange-300 text-orange-700",
};

const DAYS_TO_SHOW = 14;

export default function CalendarPage() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<Record<string, RoomType>>({});
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [floorFilter, setFloorFilter] = useState<number | "all">("all");

  useEffect(() => {
    Promise.all([
      api.get("/rooms/"),
      api.get("/rooms/types"),
      api.get("/bookings/?limit=200"),
    ]).then(([r, t, b]) => {
      setRooms(r.data);
      const typeMap: Record<string, RoomType> = {};
      t.data.forEach((rt: RoomType) => { typeMap[rt.id] = rt; });
      setRoomTypes(typeMap);
      setBookings(b.data.filter((bk: Booking) => !["cancelled", "no_show"].includes(bk.status)));
    }).finally(() => setLoading(false));
  }, []);

  const days = Array.from({ length: DAYS_TO_SHOW }, (_, i) => addDays(weekStart, i));
  const floors = Array.from(new Set(rooms.map(r => r.floor))).sort((a, b) => a - b);
  const filteredRooms = floorFilter === "all" ? rooms : rooms.filter(r => r.floor === floorFilter);

  const getBookingForRoomOnDay = (roomId: string, day: Date) => {
    return bookings.find(b => {
      if (b.room_id !== roomId) return false;
      const ci = parseISO(b.check_in_date);
      const co = parseISO(b.check_out_date);
      return day >= ci && day < co;
    });
  };

  const isBookingStart = (b: Booking, day: Date) => isSameDay(parseISO(b.check_in_date), day);

  if (loading) return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(w => subWeeks(w, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[200px] text-center">
            {format(weekStart, "dd MMM")} — {format(addDays(weekStart, DAYS_TO_SHOW - 1), "dd MMM yyyy")}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(w => addWeeks(w, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
        </div>

        {/* Floor filter */}
        <div className="flex gap-1.5 flex-wrap">
          <Button
            size="sm" variant={floorFilter === "all" ? "default" : "outline"} className="h-7 text-xs"
            onClick={() => setFloorFilter("all")}
          >All Floors</Button>
          {floors.map(f => (
            <Button
              key={f} size="sm" variant={floorFilter === f ? "default" : "outline"} className="h-7 text-xs"
              onClick={() => setFloorFilter(f === floorFilter ? "all" : f)}
            >Floor {f}</Button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {Object.entries(statusColors).filter(([k]) => k !== "cancelled" && k !== "no_show").map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
              <span className="capitalize">{status.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs border-collapse" style={{ minWidth: "900px" }}>
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground w-24 border-b border-r sticky left-0 bg-muted/50 z-10">
                Room
              </th>
              {days.map(day => {
                const isToday = isSameDay(day, new Date());
                return (
                  <th
                    key={day.toISOString()}
                    className={`px-2 py-2 text-center border-b font-medium ${isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                    style={{ minWidth: "54px" }}
                  >
                    <div className="font-semibold">{format(day, "EEE")}</div>
                    <div className={`text-base mt-0.5 ${isToday ? "bg-primary text-white rounded-full w-7 h-7 flex items-center justify-center mx-auto" : ""}`}>
                      {format(day, "d")}
                    </div>
                    <div className="text-xs opacity-60">{format(day, "MMM")}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRooms.map((room, roomIdx) => {
              const rt = roomTypes[room.room_type_id];
              return (
                <tr key={room.id} className={roomIdx % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                  <td className="px-3 py-1.5 border-r border-b sticky left-0 bg-inherit z-10">
                    <div className="font-bold text-sm">{room.room_number}</div>
                    <div className="text-xs text-muted-foreground truncate">{rt?.name}</div>
                  </td>
                  {days.map(day => {
                    const booking = getBookingForRoomOnDay(room.id, day);
                    const isStart = booking ? isBookingStart(booking, day) : false;
                    const isToday = isSameDay(day, new Date());

                    return (
                      <td
                        key={day.toISOString()}
                        className={`border-b border-r p-0 relative ${isToday ? "bg-primary/5" : ""}`}
                        style={{ height: "40px" }}
                      >
                        {booking ? (
                          <div
                            className={`absolute inset-0.5 rounded cursor-pointer flex items-center overflow-hidden border ${statusBg[booking.status]}`}
                            onClick={() => router.push(`/dashboard/bookings/${booking.booking_ref}`)}
                            title={`${booking.booking_ref} · ${booking.num_adults} guests`}
                          >
                            {isStart && (
                              <span className="px-1.5 text-xs font-semibold truncate whitespace-nowrap">
                                {booking.booking_ref}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="absolute inset-0" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filteredRooms.length} rooms · Click any booking to open details
      </p>
    </div>
  );
}
