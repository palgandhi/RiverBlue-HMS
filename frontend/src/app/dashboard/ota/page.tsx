"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Wifi, WifiOff } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

interface RoomType {
  id: string;
  name: string;
  base_price_per_night: number;
}

interface RatePlan {
  id: string;
  room_type_id: string;
  name: string;
  source: string;
  price_per_night: number;
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
}

interface OTAChannel {
  id: string;
  channel_name: string;
  display_name: string;
  is_active: boolean;
  commission_pct: number;
  last_synced_at: string | null;
  api_endpoint: string | null;
}

const SOURCES = [
  { value: "direct",        label: "Direct" },
  { value: "makemytrip",    label: "MakeMyTrip" },
  { value: "ixigo",         label: "Ixigo" },
  { value: "booking_com",   label: "Booking.com" },
  { value: "expedia",       label: "Expedia" },
  { value: "channel_manager", label: "Channel Manager" },
  { value: "other",         label: "Other" },
];

const sourceColor: Record<string, string> = {
  direct:          "bg-blue-100 text-blue-700",
  makemytrip:      "bg-red-100 text-red-700",
  ixigo:           "bg-orange-100 text-orange-700",
  booking_com:     "bg-purple-100 text-purple-700",
  expedia:         "bg-yellow-100 text-yellow-700",
  channel_manager: "bg-teal-100 text-teal-700",
  other:           "bg-gray-100 text-gray-600",
};

export default function OTAPage() {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [channels, setChannels] = useState<OTAChannel[]>([]);
  const [loading, setLoading] = useState(true);

  const [planOpen, setPlanOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [planForm, setPlanForm] = useState({
    room_type_id: "", name: "", source: "makemytrip", price_per_night: ""
  });
  const [channelForm, setChannelForm] = useState({
    channel_name: "", display_name: "", api_endpoint: "",
    webhook_secret: "", api_key: "", commission_pct: "15"
  });

  useEffect(() => {
    Promise.all([
      api.get("/rooms/types"),
      api.get("/ota/rate-plans"),
      api.get("/ota/channels"),
    ]).then(([rt, rp, ch]) => {
      setRoomTypes(rt.data);
      setRatePlans(rp.data);
      setChannels(ch.data);
    }).finally(() => setLoading(false));
  }, []);

  const getRoomTypeName = (id: string) => roomTypes.find(r => r.id === id)?.name || "—";

  const handleAddPlan = async () => {
    if (!planForm.room_type_id || !planForm.name || !planForm.price_per_night) {
      toast.error("Fill all required fields");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/ota/rate-plans", {
        room_type_id: planForm.room_type_id,
        name: planForm.name,
        source: planForm.source,
        price_per_night: Math.round(parseFloat(planForm.price_per_night) * 100),
      });
      setRatePlans(prev => [...prev, res.data]);
      setPlanOpen(false);
      setPlanForm({ room_type_id: "", name: "", source: "makemytrip", price_per_night: "" });
      toast.success("Rate plan created");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePlan = async (plan: RatePlan) => {
    try {
      const res = await api.patch(`/ota/rate-plans/${plan.id}`, { is_active: !plan.is_active });
      setRatePlans(prev => prev.map(p => p.id === plan.id ? res.data : p));
      toast.success(`Rate plan ${res.data.is_active ? "activated" : "deactivated"}`);
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleAddChannel = async () => {
    if (!channelForm.channel_name || !channelForm.display_name) {
      toast.error("Channel name and display name required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/ota/channels", {
        ...channelForm,
        commission_pct: parseInt(channelForm.commission_pct || "0"),
      });
      setChannels(prev => [...prev, res.data]);
      setChannelOpen(false);
      setChannelForm({ channel_name: "", display_name: "", api_endpoint: "", webhook_secret: "", api_key: "", commission_pct: "15" });
      toast.success("Channel configured");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleChannel = async (ch: OTAChannel) => {
    try {
      const res = await api.patch(`/ota/channels/${ch.id}`, { is_active: !ch.is_active });
      setChannels(prev => prev.map(c => c.id === ch.id ? res.data : c));
      toast.success(`${ch.display_name} ${res.data.is_active ? "activated" : "deactivated"}`);
    } catch {
      toast.error("Failed to update");
    }
  };

  if (loading) return <div className="h-32 bg-muted animate-pulse rounded-lg" />;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">OTA Integration Status</p>
        <p>Configure your channel manager credentials here. Once you have a channel manager account (RezNext, Staah, etc.), enter the API details below to start receiving bookings automatically.</p>
        <p className="mt-1 text-xs">Availability API: <span className="font-mono bg-amber-100 px-1 rounded">POST /api/v1/ota/availability</span></p>
        <p className="text-xs">Inbound Webhook: <span className="font-mono bg-amber-100 px-1 rounded">POST /api/v1/ota/webhook/inbound</span></p>
      </div>

      <Tabs defaultValue="rates">
        <TabsList className="h-8">
          <TabsTrigger value="rates" className="text-xs h-7">Rate Plans</TabsTrigger>
          <TabsTrigger value="channels" className="text-xs h-7">Channels</TabsTrigger>
        </TabsList>

        {/* Rate Plans */}
        <TabsContent value="rates" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Set different prices per room type per OTA source.
              If no rate plan exists for a source, the base rate is used.
            </p>
            <Button size="sm" onClick={() => setPlanOpen(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add Rate Plan
            </Button>
          </div>

          {ratePlans.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                No rate plans yet. Add one to set OTA-specific pricing.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {ratePlans.map(plan => (
                <Card key={plan.id} className={!plan.is_active ? "opacity-60" : ""}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceColor[plan.source] || "bg-gray-100 text-gray-600"}`}>
                          {SOURCES.find(s => s.value === plan.source)?.label || plan.source}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{plan.name}</p>
                          <p className="text-xs text-muted-foreground">{getRoomTypeName(plan.room_type_id)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-sm font-semibold">₹{(plan.price_per_night / 100).toLocaleString("en-IN")}<span className="text-xs text-muted-foreground font-normal">/night</span></p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleTogglePlan(plan)}
                        >
                          {plan.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Channels */}
        <TabsContent value="channels" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Configure channel manager or direct OTA connections.
            </p>
            <Button size="sm" onClick={() => setChannelOpen(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add Channel
            </Button>
          </div>

          {channels.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                No channels configured. Add your channel manager when ready.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {channels.map(ch => (
                <Card key={ch.id}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {ch.is_active
                          ? <Wifi className="h-4 w-4 text-green-600" />
                          : <WifiOff className="h-4 w-4 text-muted-foreground" />
                        }
                        <div>
                          <p className="text-sm font-medium">{ch.display_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{ch.channel_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Commission</p>
                          <p className="text-sm font-medium">{ch.commission_pct}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Last sync</p>
                          <p className="text-xs">{ch.last_synced_at
                            ? new Date(ch.last_synced_at).toLocaleDateString("en-IN")
                            : "Never"
                          }</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ch.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {ch.is_active ? "Active" : "Inactive"}
                        </span>
                        <Button variant="outline" size="sm" className="h-7 text-xs"
                          onClick={() => handleToggleChannel(ch)}>
                          {ch.is_active ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </div>
                    {ch.api_endpoint && (
                      <p className="text-xs text-muted-foreground mt-2 font-mono">{ch.api_endpoint}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Rate Plan Dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-w-sm bg-card">
          <DialogHeader><DialogTitle>Add Rate Plan</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Room Type</Label>
              <Select onValueChange={v => setPlanForm(f => ({ ...f, room_type_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select room type" /></SelectTrigger>
                <SelectContent>
                  {roomTypes.map(rt => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Source / Channel</Label>
              <Select defaultValue="makemytrip" onValueChange={v => setPlanForm(f => ({ ...f, source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Plan Name</Label>
              <Input placeholder="e.g. MakeMyTrip Standard Rate"
                value={planForm.name}
                onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rate per Night (₹)</Label>
              <Input type="number" placeholder="e.g. 2700"
                value={planForm.price_per_night}
                onChange={e => setPlanForm(f => ({ ...f, price_per_night: e.target.value }))} />
            </div>
            {planForm.price_per_night && planForm.room_type_id && (
              <div className="bg-muted/50 rounded p-2 text-xs text-center">
                Base rate: ₹{((roomTypes.find(r => r.id === planForm.room_type_id)?.base_price_per_night || 0) / 100).toLocaleString("en-IN")} →
                OTA rate: ₹{parseFloat(planForm.price_per_night || "0").toLocaleString("en-IN")}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleAddPlan} disabled={submitting}>
                {submitting ? "Creating..." : "Create Plan"}
              </Button>
              <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Channel Dialog */}
      <Dialog open={channelOpen} onOpenChange={setChannelOpen}>
        <DialogContent className="max-w-sm bg-card">
          <DialogHeader><DialogTitle>Add Channel</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Channel Name (internal key)</Label>
              <Input placeholder="e.g. reznext" value={channelForm.channel_name}
                onChange={e => setChannelForm(f => ({ ...f, channel_name: e.target.value.toLowerCase().replace(/\s/g, "_") }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Display Name</Label>
              <Input placeholder="e.g. RezNext Channel Manager" value={channelForm.display_name}
                onChange={e => setChannelForm(f => ({ ...f, display_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Commission %</Label>
              <Input type="number" min="0" max="50" value={channelForm.commission_pct}
                onChange={e => setChannelForm(f => ({ ...f, commission_pct: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">API Endpoint (optional — fill when ready)</Label>
              <Input placeholder="https://api.channelmanager.com/v1" value={channelForm.api_endpoint}
                onChange={e => setChannelForm(f => ({ ...f, api_endpoint: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Webhook Secret (optional)</Label>
              <Input placeholder="Provided by channel manager" value={channelForm.webhook_secret}
                onChange={e => setChannelForm(f => ({ ...f, webhook_secret: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleAddChannel} disabled={submitting}>
                {submitting ? "Saving..." : "Save Channel"}
              </Button>
              <Button variant="outline" onClick={() => setChannelOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
