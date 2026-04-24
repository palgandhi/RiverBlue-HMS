"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

const navigation = [
  { name: "Dashboard",   href: "/dashboard",   icon: "▦", roles: ["admin","receptionist","housekeeping","fb_staff"] },
  { name: "Rooms",       href: "/dashboard/rooms",     icon: "⬜", roles: ["admin","receptionist","housekeeping"] },
  { name: "Bookings",    href: "/dashboard/bookings",  icon: "📋", roles: ["admin","receptionist"] },
  { name: "Check-in",    href: "/dashboard/checkin",   icon: "↩", roles: ["admin","receptionist"] },
  { name: "Housekeeping",href: "/dashboard/housekeeping", icon: "🧹", roles: ["admin","housekeeping"] },
  { name: "Staff",       href: "/dashboard/staff",     icon: "👤", roles: ["admin"] },
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
    <div className="flex flex-col h-full w-60 border-r bg-card px-3 py-4">
      <div className="flex items-center gap-2 px-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">R</div>
        <div>
          <p className="text-sm font-semibold leading-none">RiverBlue</p>
          <p className="text-xs text-muted-foreground">HMS</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5">
        {filtered.map((item) => (
          <Link key={item.href} href={item.href}>
            <span className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              pathname === item.href
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}>
              <span className="text-base">{item.icon}</span>
              {item.name}
            </span>
          </Link>
        ))}
      </nav>

      <Separator className="my-3" />

      <div className="flex items-center gap-3 px-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {user?.full_name?.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.full_name}</p>
          <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs text-muted-foreground h-7">
          Out
        </Button>
      </div>
    </div>
  );
}
