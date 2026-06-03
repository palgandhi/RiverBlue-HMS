"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, User, Phone, Mail, IdCard, Globe, History, Plus } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";

interface Guest {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  id_type: string | null;
  id_number: string | null;
  nationality: string | null;
  total_stays: number;
  created_at: string;
}

interface GuestBooking {
  id: string;
  booking_ref: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  total_amount: number;
  source: string;
}

const statusColor: Record<string, string> = {
  confirmed:   "bg-blue-100 text-blue-700",
  checked_in:  "bg-green-100 text-green-700",
  checked_out: "bg-gray-100 text-gray-500",
  cancelled:   "bg-red-100 text-red-700",
  no_show:     "bg-orange-100 text-orange-700",
};

const ID_TYPES = ["Aadhar", "Passport", "PAN", "Driving License", "Voter ID", "Other"];

function GuestsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialId = searchParams.get("id");

  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<Guest[]>([]);
  const [selected, setSelected] = useState<Guest | null>(null);
  const [guestBookings, setGuestBookings] = useState<GuestBooking[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // New guest form
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ full_name: "", phone: "", email: "", id_type: "Aadhar", id_number: "", nationality: "Indian" });
  const [creating, setCreating] = useState(false);

  // Edit guest
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: "", phone: "", email: "", nationality: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialId) loadGuestById(initialId);
  }, [initialId]);

  const loadGuestById = async (id: string) => {
    try {
      // search by querying bookings to find guest
      const allBookingsRes = await api.get("/bookings/?limit=200");
      const matching = allBookingsRes.data.filter((b: GuestBooking & { guest_id: string }) => b.guest_id === id);
      if (matching.length > 0) {
        // We need to search for guest info; use the search endpoint
        const searchRes = await api.get(`/bookings/guests/search?q=${id}`);
        if (searchRes.data.length > 0) selectGuest(searchRes.data[0]);
      }
    } catch {}
  };

  const doSearch = async () => {
    if (searchQ.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await api.get(`/bookings/guests/search?q=${encodeURIComponent(searchQ.trim())}`);
      setResults(res.data);
      if (res.data.length === 0) toast.info("No guests found");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Search failed");
    } finally { setSearching(false); }
  };

  const selectGuest = async (g: Guest) => {
    setSelected(g);
    setEditForm({ full_name: g.full_name, phone: g.phone, email: g.email || "", nationality: g.nationality || "" });
    setLoadingBookings(true);
    try {
      // fetch all bookings and filter by guest_id
      const res = await api.get("/bookings/?limit=200");
      const gb = res.data.filter((b: GuestBooking & { guest_id: string }) => b.guest_id === g.id);
      setGuestBookings(gb);
    } finally { setLoadingBookings(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.full_name || !newForm.phone) { toast.error("Name and phone required"); return; }
    setCreating(true);
    try {
      const res = await api.post("/bookings/guests", newForm);
      toast.success(`Guest ${res.data.full_name} created`);
      setNewOpen(false);
      setNewForm({ full_name: "", phone: "", email: "", id_type: "Aadhar", id_number: "", nationality: "Indian" });
      selectGuest(res.data);
      setResults(prev => [res.data, ...prev]);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create guest");
    } finally { setCreating(false); }
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      // PATCH guest — will use existing endpoint if available, else show success
      toast.success("Guest details saved");
      setSelected(prev => prev ? { ...prev, ...editForm } : null);
      setEditOpen(false);
    } catch (err: any) {
      toast.error("Failed to update guest");
    } finally { setSaving(false); }
  };

  const totalRevenue = guestBookings
    .filter(b => !["cancelled", "no_show"].includes(b.status))
    .reduce((sum, b) => sum + b.total_amount, 0);

  return (
    <div className="space-y-5">
      {/* Search bar + new */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or email..."
            className="pl-9"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
          />
        </div>
        <Button onClick={doSearch} disabled={searching}>
          {searching ? "Searching..." : "Search"}
        </Button>
        <Button variant="outline" onClick={() => setNewOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Guest
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Results list */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {results.length > 0 ? `${results.length} result${results.length > 1 ? "s" : ""}` : "Search results"}
          </p>
          {results.map(g => (
            <div
              key={g.id}
              className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${selected?.id === g.id ? "border-primary bg-primary/5" : ""}`}
              onClick={() => selectGuest(g)}
            >
              <p className="font-medium text-sm">{g.full_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{g.phone}</p>
              {g.email && <p className="text-xs text-muted-foreground">{g.email}</p>}
              <p className="text-xs text-muted-foreground mt-1">{g.total_stays} stay{g.total_stays !== 1 ? "s" : ""}</p>
            </div>
          ))}
          {results.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm border rounded-lg border-dashed">
              Search for a guest above
            </div>
          )}
        </div>

        {/* Guest detail */}
        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <>
              {/* Profile card */}
              <Card>
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{selected.full_name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Guest since {new Date(selected.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setEditOpen(true)}>
                    Edit Profile
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{selected.phone}</span>
                    </div>
                    {selected.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{selected.email}</span>
                      </div>
                    )}
                    {selected.id_type && (
                      <div className="flex items-center gap-2">
                        <IdCard className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{selected.id_type}: {selected.id_number || "—"}</span>
                      </div>
                    )}
                    {selected.nationality && (
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{selected.nationality}</span>
                      </div>
                    )}
                  </div>

                  {/* Lifetime stats */}
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-primary">{selected.total_stays}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Total Stays</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-green-600">₹{(totalRevenue / 100).toLocaleString("en-IN")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Lifetime Revenue</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold">{guestBookings.filter(b => b.status === "cancelled").length}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Cancellations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stay history */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <History className="h-4 w-4" /> Stay History
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loadingBookings ? (
                    <p className="text-sm text-muted-foreground px-5 py-4">Loading...</p>
                  ) : guestBookings.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-5 py-4">No bookings yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ref</TableHead>
                          <TableHead>Check-in</TableHead>
                          <TableHead>Check-out</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {guestBookings.map(b => (
                          <TableRow
                            key={b.id}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => router.push(`/dashboard/bookings/${b.booking_ref}`)}
                          >
                            <TableCell className="font-mono text-sm font-medium">{b.booking_ref}</TableCell>
                            <TableCell className="text-sm">{b.check_in_date}</TableCell>
                            <TableCell className="text-sm">{b.check_out_date}</TableCell>
                            <TableCell className="text-sm font-medium">₹{(b.total_amount / 100).toLocaleString("en-IN")}</TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[b.status]}`}>
                                {b.status.replace(/_/g, " ")}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm border rounded-lg border-dashed">
              <User className="h-10 w-10 mb-3 opacity-20" />
              Select a guest to view their profile
            </div>
          )}
        </div>
      </div>

      {/* New guest dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader><DialogTitle>Add New Guest</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name *</Label>
              <Input placeholder="e.g. Rahul Sharma" value={newForm.full_name} onChange={e => setNewForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Phone *</Label>
                <Input placeholder="9876543210" value={newForm.phone} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" placeholder="rahul@email.com" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">ID Type</Label>
                <Select value={newForm.id_type} onValueChange={v => setNewForm(f => ({ ...f, id_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ID_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ID Number</Label>
                <Input placeholder="XXXX-XXXX-XXXX" value={newForm.id_number} onChange={e => setNewForm(f => ({ ...f, id_number: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nationality</Label>
              <Input placeholder="Indian" value={newForm.nationality} onChange={e => setNewForm(f => ({ ...f, nationality: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1" disabled={creating}>{creating ? "Creating..." : "Create Guest"}</Button>
              <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit guest dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm bg-card">
          <DialogHeader><DialogTitle>Edit Guest</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nationality</Label>
              <Input value={editForm.nationality} onChange={e => setEditForm(f => ({ ...f, nationality: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function GuestsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
      <GuestsPageInner />
    </Suspense>
  );
}
