"use client";
import { Loader2, PlayCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DemoButton({ dark }: { dark?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" variant="secondary" disabled={pending} className={cn(dark && "border-sidebar-border bg-sidebar-active text-white hover:bg-sidebar-border")}>
      {pending ? <Loader2 className="animate-spin" /> : <PlayCircle />}
      {pending ? "Preparing demo…" : "Explore Live Demo"}
    </Button>
  );
}
