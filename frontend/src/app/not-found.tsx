import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="text-center space-y-4">
        <p className="text-6xl font-bold text-muted-foreground/30">404</p>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">The page you are looking for does not exist.</p>
        <Link href="/dashboard">
          <Button size="sm">Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
