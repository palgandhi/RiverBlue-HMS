"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { toast } from "sonner";

const TIMEOUT_MS = 30 * 60 * 1000;

export function useSessionTimeout() {
  const { token, logout } = useAuthStore();
  const router = useRouter();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!token) return;
    timerRef.current = setTimeout(() => {
      logout();
      toast.warning("Session expired. Please log in again.");
      router.push("/login");
    }, TIMEOUT_MS);
  };

  useEffect(() => {
    if (!token) return;
    const events = ["mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [token]);
}
