"use client";
import { Button } from "@/components/ui/button";

export function PrintButton({ children }: { children: React.ReactNode }) {
  return <Button size="sm" variant="secondary" type="button" onClick={() => window.print()}>{children}</Button>;
}
