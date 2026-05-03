"use client";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/rooms": "Rooms",
  "/dashboard/bookings": "Bookings",
  "/dashboard/bookings/new": "New Booking",
  "/dashboard/checkin": "Check-in / Check-out",
  "/dashboard/housekeeping": "Housekeeping",
  "/dashboard/staff": "Staff Management",
  "/dashboard/settings": "Hotel Settings",
  "/dashboard/reports": "Reports & Analytics",
  "/dashboard/ota": "OTA & Rate Plans",
};

export default function TopBar() {
  const pathname = usePathname();
  const title = titles[pathname] || "RiverBlue HMS";

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  return (
    <div className="h-14 border-b bg-card flex items-center justify-between px-6 shrink-0">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="flex items-center gap-4">
        <p className="text-sm text-muted-foreground hidden md:block">{dateStr}</p>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
