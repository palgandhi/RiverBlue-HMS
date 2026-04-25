"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { token, setAuth } = useAuthStore();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("access_token");
    const storedUser = localStorage.getItem("user");
    if (storedToken && storedUser) {
      try {
        setAuth(JSON.parse(storedUser), storedToken);
      } catch {
        router.push("/login");
      }
    } else {
      router.push("/login");
    }
    setReady(true);
  }, []);

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="text-sm text-muted-foreground">Loading...</div>
    </div>
  );

  if (!token) return null;

  return (
    <div className="flex h-screen bg-muted/30 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
