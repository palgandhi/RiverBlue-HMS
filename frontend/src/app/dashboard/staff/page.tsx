"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import api from "@/lib/api";
import { User, UserRole } from "@/types";
import { useAuthStore } from "@/store/auth";
import { toast } from "sonner";

const ROLES: UserRole[] = ["admin", "receptionist", "housekeeping", "fb_staff"];

const roleColor: Record<UserRole, string> = {
  admin:         "bg-purple-100 text-purple-700",
  receptionist:  "bg-blue-100 text-blue-700",
  housekeeping:  "bg-amber-100 text-amber-700",
  fb_staff:      "bg-green-100 text-green-700",
};

export default function StaffPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "receptionist" as UserRole });
  const currentUser = useAuthStore((s) => s.user);

  useEffect(() => {
    api.get("/users/").then(r => setUsers(r.data)).finally(() => setLoading(false));
  }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.password) {
      toast.error("All fields required");
      return;
    }
    setCreating(true);
    try {
      const res = await api.post("/users/", form);
      setUsers(prev => [res.data, ...prev]);
      setOpen(false);
      setForm({ full_name: "", email: "", password: "", role: "receptionist" });
      toast.success(`Staff member ${res.data.full_name} created`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error("You cannot deactivate your own account");
      return;
    }
    try {
      const res = await api.patch(`/users/${user.id}`, { is_active: !user.is_active });
      setUsers(prev => prev.map(u => u.id === user.id ? res.data : u));
      toast.success(`${user.full_name} ${res.data.is_active ? "activated" : "deactivated"}`);
    } catch {
      toast.error("Failed to update user");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{users.length} team members</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>+ Add Staff</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : users.map(user => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {user.full_name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{user.full_name}</span>
                        {user.id === currentUser?.id && (
                          <span className="text-xs text-muted-foreground">(you)</span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${roleColor[user.role]}`}>
                      {user.role.replace("_", " ")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {user.id !== currentUser?.id && (
                      <Button variant="ghost" size="sm" className="text-xs h-7"
                        onClick={() => toggleActive(user)}>
                        {user.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input placeholder="Jane Doe" value={form.full_name} onChange={e => set("full_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="jane@riverblue.com" value={form.email} onChange={e => set("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" placeholder="Min. 8 characters" value={form.password} onChange={e => set("password", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select defaultValue="receptionist" onValueChange={v => set("role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={creating} className="flex-1">
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
