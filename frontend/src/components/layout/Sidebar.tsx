"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard, BedDouble, CalendarDays, LogIn,
  Sparkles, Users, LogOut, ChevronRight
} from "lucide-react";

const navigation = [
  { name: "Dashboard",    href: "/dashboard",                icon: LayoutDashboard, roles: ["admin","receptionist","housekeeping","fb_staff"] },
  { name: "Rooms",        href: "/dashboard/rooms",          icon: BedDouble,       roles: ["admin","receptionist","housekeeping"] },
  { name: "Bookings",     href: "/dashboard/bookings",       icon: CalendarDays,    roles: ["admin","receptionist"] },
  { name: "Check-in",     href: "/dashboard/checkin",        icon: LogIn,           roles: ["admin","receptionist"] },
  { name: "Housekeeping", href: "/dashboard/housekeeping",   icon: Sparkles,        roles: ["admin","housekeeping","receptionist"] },
  { name: "Staff",        href: "/dashboard/staff",          icon: Users,           roles: ["admin"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const filtered = navigation.filter(n => user && n.roles.includes(user.role));

  return (
    <div className="flex flex-col h-full w-60 border-r bg-card px-3 py-4 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">R</div>
        <div>
          <p className="text-sm font-semibold leading-none">RiverBlue</p>
          <p className="text-xs text-muted-foreground mt-0.5">Hotel Management</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5">
        {filtered.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <span className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 group",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <span className="flex-1">{item.name}</span>
                {active && <ChevronRight className="h-3 w-3 text-primary" />}
              </span>
            </Link>
          );
        })}
      </nav>

      <Separator className="my-3" />

      {/* User footer */}
      <div className="flex items-center gap-3 px-2">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {user?.full_name?.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate leading-none">{user?.full_name}</p>
          <p className="text-xs text-muted-foreground capitalize mt-0.5">{user?.role?.replace("_"," ")}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
