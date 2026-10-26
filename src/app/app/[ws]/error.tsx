"use client";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ reset, error }: { reset: () => void; error: Error & { digest?: string } }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-[13.5px] text-muted">The page could not be loaded. Your data is safe. {error.digest ? <span className="font-mono text-[11px]">Ref {error.digest}</span> : null}</p>
      <Button className="mt-5" onClick={reset}>Try again</Button>
    </div>
  );
}
