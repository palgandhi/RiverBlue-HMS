"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

interface HotelSettings {
  id: string;
  hotel_name: string;
  gstin: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  state_code: string;
  pincode: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  checkin_time: string;
  checkout_time: string;
  currency: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<HotelSettings>>({});

  useEffect(() => {
    api.get("/settings/").then(r => {
      setSettings(r.data);
      setForm(r.data);
    }).finally(() => setLoading(false));
  }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.patch("/settings/", form);
      setSettings(res.data);
      toast.success("Settings saved");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-32 bg-muted animate-pulse rounded-lg" />;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Hotel Settings</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Hotel Identity</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Hotel Name</Label>
              <Input value={form.hotel_name || ""} onChange={e => set("hotel_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">GSTIN</Label>
              <Input placeholder="24AAAAA0000A1Z5" value={form.gstin || ""} onChange={e => set("gstin", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone || ""} onChange={e => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input value={form.email || ""} onChange={e => set("email", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Website</Label>
            <Input value={form.website || ""} onChange={e => set("website", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Address</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Address Line 1</Label>
            <Input value={form.address_line1 || ""} onChange={e => set("address_line1", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Address Line 2</Label>
            <Input value={form.address_line2 || ""} onChange={e => set("address_line2", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">City</Label>
              <Input value={form.city || ""} onChange={e => set("city", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State</Label>
              <Input value={form.state || ""} onChange={e => set("state", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pincode</Label>
              <Input value={form.pincode || ""} onChange={e => set("pincode", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">State Code (for GST)</Label>
            <Input placeholder="e.g. 24 for Gujarat" value={form.state_code || ""} onChange={e => set("state_code", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Operations</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Standard Check-in Time</Label>
              <Input type="time" value={form.checkin_time || "14:00"} onChange={e => set("checkin_time", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Standard Check-out Time</Label>
              <Input type="time" value={form.checkout_time || "11:00"} onChange={e => set("checkout_time", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
