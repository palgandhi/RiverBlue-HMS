"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, Plus, CreditCard, ArrowLeft, Printer } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

interface InvoiceItem {
  id: string;
  description: string;
  item_type: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Payment {
  id: string;
  amount: number;
  method: string;
  transaction_ref: string | null;
  status: string;
  paid_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  status: string;
  issued_at: string | null;
  paid_at: string | null;
}

interface Folio {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Payment[];
  total_paid: number;
  balance_due: number;
  booking_status: string;
  booking_ref: string;
}

const itemTypeOptions = [
  { value: "fb",            label: "F&B / Room Service" },
  { value: "laundry",       label: "Laundry" },
  { value: "minibar",       label: "Minibar" },
  { value: "early_checkin", label: "Early Check-in" },
  { value: "late_checkout", label: "Late Check-out" },
  { value: "damage",        label: "Damage" },
  { value: "adjustment",    label: "Adjustment / Other" },
];

const paymentMethods = [
  { value: "cash",          label: "Cash" },
  { value: "card",          label: "Card" },
  { value: "upi",           label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "ota_prepaid",   label: "OTA Prepaid" },
];

const itemTypeColor: Record<string, string> = {
  room:          "bg-blue-100 text-blue-700",
  tax:           "bg-gray-100 text-gray-600",
  fb:            "bg-orange-100 text-orange-700",
  laundry:       "bg-purple-100 text-purple-700",
  minibar:       "bg-pink-100 text-pink-700",
  damage:        "bg-red-100 text-red-700",
  early_checkin: "bg-amber-100 text-amber-700",
  late_checkout: "bg-amber-100 text-amber-700",
  discount:      "bg-green-100 text-green-700",
  adjustment:    "bg-gray-100 text-gray-600",
};

const statusColor: Record<string, string> = {
  draft:          "bg-gray-100 text-gray-600",
  issued:         "bg-blue-100 text-blue-700",
  paid:           "bg-green-100 text-green-700",
  partially_paid: "bg-amber-100 text-amber-700",
  void:           "bg-red-100 text-red-700",
};

function BillingPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = searchParams.get("booking_id");
  const bookingRef = searchParams.get("ref");

  const [folio, setFolio] = useState<Folio | null>(null);
  const [loading, setLoading] = useState(true);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [charge, setCharge] = useState({
    description: "", item_type: "fb", quantity: "1", unit_price: ""
  });
  const [payment, setPayment] = useState({
    amount: "", method: "cash", transaction_ref: ""
  });
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discount, setDiscount] = useState({ type: "percentage", value: "", reason: "" });

  useEffect(() => {
    if (!bookingId) return;
    loadFolio();
  }, [bookingId]);

  const loadFolio = async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const res = await api.get(`/billing/folio/${bookingId}`);
      setFolio(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to load folio");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCharge = async () => {
    if (!bookingId || !charge.description || !charge.unit_price) {
      toast.error("Please fill all fields");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/billing/folio/${bookingId}/items`, {
        description: charge.description,
        item_type: charge.item_type,
        quantity: parseInt(charge.quantity),
        unit_price: Math.round(parseFloat(charge.unit_price) * 100),
      });
      await loadFolio();
      setChargeOpen(false);
      setCharge({ description: "", item_type: "fb", quantity: "1", unit_price: "" });
      toast.success("Charge added to folio");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to add charge");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayment = async () => {
    if (!bookingId || !payment.amount || !payment.method) {
      toast.error("Please fill all fields");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/billing/folio/${bookingId}/payments`, {
        amount: Math.round(parseFloat(payment.amount) * 100),
        method: payment.method,
        transaction_ref: payment.transaction_ref || undefined,
      });
      await loadFolio();
      setPaymentOpen(false);
      setPayment({ amount: "", method: "cash", transaction_ref: "" });
      toast.success("Payment recorded");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalise = async () => {
    if (!bookingId) return;
    try {
      await api.post(`/billing/folio/${bookingId}/finalise`);
      await loadFolio();
      toast.success("Invoice finalised");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to finalise");
    }
  };

  const handleDiscount = async () => {
    if (!bookingId || !discount.value || !discount.reason) {
      toast.error("Please fill all fields");
      return;
    }
    setSubmitting(true);
    try {
      const subtotal = folio!.invoice.subtotal;
      let discountAmount = 0;
      if (discount.type === "percentage") {
        const pct = parseFloat(discount.value);
        if (pct <= 0 || pct > 100) { toast.error("Percentage must be between 1 and 100"); setSubmitting(false); return; }
        discountAmount = Math.round(subtotal * pct / 100);
      } else {
        discountAmount = Math.round(parseFloat(discount.value) * 100);
        if (discountAmount <= 0) { toast.error("Amount must be greater than 0"); setSubmitting(false); return; }
        if (discountAmount > subtotal) { toast.error("Discount cannot exceed subtotal"); setSubmitting(false); return; }
      }
      await api.post(`/billing/folio/${bookingId}/items`, {
        description: discount.reason,
        item_type: "discount",
        quantity: 1,
        unit_price: discountAmount,
      });
      await loadFolio();
      setDiscountOpen(false);
      setDiscount({ type: "percentage", value: "", reason: "" });
      toast.success(`Discount of ₹${(discountAmount / 100).toLocaleString("en-IN")} applied`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to apply discount");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckout = async () => {
    if (!bookingId || !folio) return;
    try {
      await api.post(`/checkins/${folio.booking_ref}/checkout`, {});
      toast.success("Guest checked out successfully");
      router.push("/dashboard/checkin");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Checkout failed");
    }
  };

  if (!bookingId) return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">No booking selected. Go to Bookings and open a folio from there.</p>
      <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/bookings")}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Go to Bookings
      </Button>
    </div>
  );

  if (loading) return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
      ))}
    </div>
  );

  if (!folio) return <p className="text-sm text-muted-foreground">Folio not found.</p>;

  const { invoice, items, payments, total_paid, balance_due } = folio;
  const roomItems = items.filter(i => i.item_type === "room");
  const taxItems = items.filter(i => i.item_type === "tax");
  const extraItems = items.filter(i => !["room", "tax"].includes(i.item_type));
  const isEditable = invoice.status === "draft";

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => router.push("/dashboard/bookings")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Folio — {bookingRef || folio.booking_ref}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{invoice.invoice_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[invoice.status]}`}>
            {invoice.status.replace(/_/g, " ")}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => window.open(`http://localhost:8000/api/v1/invoice/${bookingId}`, "_blank")}
          >
            <Printer className="h-3 w-3 mr-1" /> Invoice
          </Button>
        </div>
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Subtotal</p>
            <p className="text-xl font-bold mt-1">₹{(invoice.subtotal / 100).toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">GST</p>
            <p className="text-xl font-bold mt-1">₹{(invoice.tax_amount / 100).toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
        <Card className={balance_due > 0 ? "border-red-200" : "border-green-200"}>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Balance Due</p>
            <p className={`text-xl font-bold mt-1 ${balance_due > 0 ? "text-red-600" : "text-green-600"}`}>
              ₹{(balance_due / 100).toLocaleString("en-IN")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Discount badge */}
      {invoice.discount_amount > 0 && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
          <span className="font-medium">Discount applied:</span>
          <span>-₹{(invoice.discount_amount / 100).toLocaleString("en-IN")}</span>
        </div>
      )}

      {/* Line items */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Charges</CardTitle>
          {isEditable && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => setChargeOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Add Charge
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => setDiscountOpen(true)}>
                % Discount
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roomItems.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm">
                    <span className={`text-xs px-1.5 py-0.5 rounded mr-2 ${itemTypeColor.room}`}>room</span>
                    {item.description}
                  </TableCell>
                  <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                  <TableCell className="text-right text-sm">₹{(item.unit_price / 100).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right text-sm font-medium">₹{(item.total_price / 100).toLocaleString("en-IN")}</TableCell>
                </TableRow>
              ))}
              {extraItems.map(item => (
                <TableRow key={item.id} className={item.item_type === "discount" ? "bg-green-50/50" : ""}>
                  <TableCell className="text-sm">
                    <span className={`text-xs px-1.5 py-0.5 rounded mr-2 ${itemTypeColor[item.item_type] || itemTypeColor.adjustment}`}>
                      {item.item_type}
                    </span>
                    {item.description}
                  </TableCell>
                  <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                  <TableCell className="text-right text-sm">
                    {item.item_type === "discount" ? "-" : ""}₹{(Math.abs(item.unit_price) / 100).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className={`text-right text-sm font-medium ${item.item_type === "discount" ? "text-green-700" : ""}`}>
                    {item.item_type === "discount" ? "-" : ""}₹{(Math.abs(item.total_price) / 100).toLocaleString("en-IN")}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell colSpan={3} className="text-sm font-medium">Subtotal</TableCell>
                <TableCell className="text-right text-sm font-medium">₹{(invoice.subtotal / 100).toLocaleString("en-IN")}</TableCell>
              </TableRow>
              {taxItems.map(item => (
                <TableRow key={item.id} className="text-muted-foreground">
                  <TableCell className="text-xs" colSpan={3}>{item.description}</TableCell>
                  <TableCell className="text-right text-xs">₹{(item.total_price / 100).toLocaleString("en-IN")}</TableCell>
                </TableRow>
              ))}
              {invoice.discount_amount > 0 && (
                <TableRow className="text-green-700">
                  <TableCell colSpan={3} className="text-sm">Total Discount</TableCell>
                  <TableCell className="text-right text-sm font-medium">-₹{(invoice.discount_amount / 100).toLocaleString("en-IN")}</TableCell>
                </TableRow>
              )}
              <TableRow className="font-semibold bg-primary/5">
                <TableCell colSpan={3} className="text-sm font-semibold">Total (incl. GST)</TableCell>
                <TableCell className="text-right text-sm font-bold">₹{(invoice.total_amount / 100).toLocaleString("en-IN")}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Payments</CardTitle>
          {balance_due > 0 && (
            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
              onClick={() => {
                setPayment(p => ({ ...p, amount: (balance_due / 100).toString() }));
                setPaymentOpen(true);
              }}>
              <CreditCard className="h-3 w-3 mr-1" /> Record Payment
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground px-5 py-4">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(p.paid_at).toLocaleString("en-IN", {
                        day: "2-digit", month: "short",
                        hour: "2-digit", minute: "2-digit"
                      })}
                    </TableCell>
                    <TableCell className="text-sm capitalize">{p.method.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.transaction_ref || "—"}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-green-700">
                      ₹{(p.amount / 100).toLocaleString("en-IN")}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={3} className="text-sm font-medium">Total Paid</TableCell>
                  <TableCell className="text-right text-sm font-bold text-green-700">
                    ₹{(total_paid / 100).toLocaleString("en-IN")}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        {isEditable && (
          <Button onClick={handleFinalise} variant="outline" className="flex-1">
            Finalise Invoice
          </Button>
        )}
        {folio.booking_status === "checked_in" && balance_due === 0 && (
          <Button onClick={handleCheckout} className="flex-1 bg-green-600 hover:bg-green-700">
            ✓ Complete Check-out
          </Button>
        )}
        {folio.booking_status === "checked_in" && balance_due > 0 && (
          <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 text-center">
            Collect ₹{(balance_due / 100).toLocaleString("en-IN")} before checkout
          </div>
        )}
      </div>

      {/* Add Charge Dialog */}
      <Dialog open={chargeOpen} onOpenChange={setChargeOpen}>
        <DialogContent className="max-w-sm bg-card">
          <DialogHeader>
            <DialogTitle>Add Charge / Discount</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={charge.item_type}
                onValueChange={v => setCharge(c => ({ ...c, item_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {itemTypeOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input placeholder="e.g. Club sandwich + fries"
                value={charge.description}
                onChange={e => setCharge(c => ({ ...c, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity</Label>
                <Input type="number" min="1" value={charge.quantity}
                  onChange={e => setCharge(c => ({ ...c, quantity: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {charge.item_type === "discount" ? "Discount Amount (₹)" : "Unit Price (₹)"}
                </Label>
                <Input type="number" min="0" placeholder="0.00"
                  value={charge.unit_price}
                  onChange={e => setCharge(c => ({ ...c, unit_price: e.target.value }))} />
              </div>
            </div>
            {charge.unit_price && charge.quantity && (
              <div className={`rounded p-2 text-sm text-center ${charge.item_type === "discount" ? "bg-green-50 text-green-700" : "bg-muted/50"}`}>
                {charge.item_type === "discount" ? "Discount: -" : "Total: "}
                <span className="font-semibold">
                  ₹{(parseFloat(charge.unit_price || "0") * parseInt(charge.quantity || "1")).toLocaleString("en-IN")}
                </span>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleAddCharge} disabled={submitting}>
                {submitting ? "Adding..." : charge.item_type === "discount" ? "Apply Discount" : "Add Charge"}
              </Button>
              <Button variant="outline" onClick={() => setChargeOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Discount Dialog */}
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent className="max-w-sm bg-card">
          <DialogHeader><DialogTitle>Apply Discount</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
              <span className="text-muted-foreground">Subtotal (before tax): </span>
              <span className="font-bold">₹{folio ? (folio.invoice.subtotal / 100).toLocaleString("en-IN") : 0}</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Discount Type</Label>
              <Select value={discount.type} onValueChange={v => setDiscount(d => ({ ...d, value: "", type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{discount.type === "percentage" ? "Discount %" : "Discount Amount (₹)"}</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max={discount.type === "percentage" ? "100" : undefined}
                  placeholder={discount.type === "percentage" ? "e.g. 10" : "e.g. 500"}
                  value={discount.value}
                  onChange={e => setDiscount(d => ({ ...d, value: e.target.value }))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {discount.type === "percentage" ? "%" : "₹"}
                </span>
              </div>
              {discount.value && folio && (
                <p className="text-xs text-green-700 font-medium">
                  = ₹{discount.type === "percentage"
                    ? (folio.invoice.subtotal * parseFloat(discount.value || "0") / 10000).toLocaleString("en-IN")
                    : parseFloat(discount.value || "0").toLocaleString("en-IN")
                  } discount
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Input
                placeholder="e.g. Loyalty discount, Corporate rate, Manager approval"
                value={discount.reason}
                onChange={e => setDiscount(d => ({ ...d, reason: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleDiscount} disabled={submitting}>
                {submitting ? "Applying..." : "Apply Discount"}
              </Button>
              <Button variant="outline" onClick={() => setDiscountOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm bg-card">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
              <span className="text-muted-foreground">Balance due: </span>
              <span className="font-bold text-amber-900">
                ₹{(balance_due / 100).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Method</Label>
              <Select value={payment.method}
                onValueChange={v => setPayment(p => ({ ...p, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentMethods.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" min="0" placeholder="0.00"
                value={payment.amount}
                onChange={e => setPayment(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Transaction Reference (optional)</Label>
              <Input placeholder="UPI ref, card last 4 digits..."
                value={payment.transaction_ref}
                onChange={e => setPayment(p => ({ ...p, transaction_ref: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handlePayment} disabled={submitting}>
                {submitting ? "Processing..." : "Record Payment"}
              </Button>
              <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
      <BillingPageInner />
    </Suspense>
  );
}
