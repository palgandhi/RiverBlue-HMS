"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import { Room, RoomType, BookingSource } from "@/types";
import { toast } from "sonner";

const SOURCES: BookingSource[] = ["direct","walk_in","makemytrip","ixigo","booking_com","expedia","phone","other"];

export default function NewBookingPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    full_name: "", phone: "", email: "", id_type: "", id_number: "",
    room_id: "", check_in_date: "", check_out_date: "",
    num_adults: "1", num_children: "0",
    source: "direct" as BookingSource, special_requests: "",
  });

  useEffect(() => {
    Promise.all([api.get("/rooms/?status=available"), api.get("/rooms/types")]).then(([r, t]) => {
      setRooms(r.data);
      setRoomTypes(t.data);
    });
  }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const getRoomTypeName = (room_type_id: string) =>
    roomTypes.find(t => t.id === room_type_id)?.name || "";

  const getNights = () => {
    if (!form.check_in_date || !form.check_out_date) return 0;
    const diff = new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime();
    return Math.max(0, diff / (1000 * 60 * 60 * 24));
  };

  const getEstimate = () => {
    const room = rooms.find(r => r.id === form.room_id);
    const type = roomTypes.find(t => t.id === room?.room_type_id);
    if (!type) return 0;
    return (type.base_price_per_night / 100) * getNights();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.phone || !form.room_id || !form.check_in_date || !form.check_out_date) {
      toast.error("Please fill all required fields");
      return;
    }
    setLoading(true);
    try {
      const guestRes = await api.post("/bookings/guests", {
        full_name: form.full_name, phone: form.phone,
        email: form.email || undefined,
        id_type: form.id_type || undefined,
        id_number: form.id_number || undefined,
      });
      const bookingRes = await api.post("/bookings/", {
        guest_id: guestRes.data.id,
        room_id: form.room_id,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        num_adults: parseInt(form.num_adults),
        num_children: parseInt(form.num_children),
        source: form.source,
        special_requests: form.special_requests || undefined,
      });
      toast.success(`Booking created — ${bookingRes.data.booking_ref}`);
      router.push("/dashboard/bookings");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create booking");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Booking</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Create a direct or walk-in booking</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Guest Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input placeholder="John Doe" value={form.full_name} onChange={e => set("full_name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone *</Label>
                <Input placeholder="+91 98765 43210" value={form.phone} onChange={e => set("phone", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input placeholder="guest@email.com" value={form.email} onChange={e => set("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>ID Type</Label>
                <Select onValueChange={v => set("id_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select ID" /></SelectTrigger>
                  <SelectContent>
                    {["Aadhar","Passport","Driving License","Voter ID","PAN"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>ID Number</Label>
              <Input placeholder="ID number" value={form.id_number} onChange={e => set("id_number", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Booking Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Room *</Label>
              <Select onValueChange={v => set("room_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select available room" /></SelectTrigger>
                <SelectContent>
                  {rooms.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      Room {r.room_number} — Floor {r.floor} — {getRoomTypeName(r.room_type_id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Check-in Date *</Label>
                <Input type="date" value={form.check_in_date} onChange={e => set("check_in_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Check-out Date *</Label>
                <Input type="date" value={form.check_out_date} onChange={e => set("check_out_date", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Adults</Label>
                <Select defaultValue="1" onValueChange={v => set("num_adults", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Children</Label>
                <Select defaultValue="0" onValueChange={v => set("num_children", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0,1,2,3].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Booking Source</Label>
              <Select defaultValue="direct" onValueChange={v => set("source", v as BookingSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Special Requests</Label>
              <Input placeholder="e.g. early check-in, extra pillows" value={form.special_requests} onChange={e => set("special_requests", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {getNights() > 0 && form.room_id && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
            <p className="text-sm text-amber-800">{getNights()} night{getNights() > 1 ? "s" : ""}</p>
            <p className="text-lg font-semibold text-amber-900">₹{getEstimate().toLocaleString()}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? "Creating..." : "Create Booking"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard/bookings")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
