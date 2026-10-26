import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 max-w-sm text-[14px] text-muted">The page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Button asChild className="mt-6"><Link href="/app">Go to RivalTide</Link></Button>
    </div>
  );
}
