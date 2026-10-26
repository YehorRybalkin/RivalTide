import type * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  green: "bg-primary-soft text-primary-soft-foreground",
  blue: "bg-accent-soft text-accent-soft-foreground",
  amber: "bg-warning-soft text-warning-soft-foreground",
  red: "bg-danger-soft text-danger-soft-foreground",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  pink: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  slate: "bg-surface-2 text-muted",
  outline: "border border-border text-muted",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "slate", className, ...props }: React.ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-4", tones[tone], className)} {...props} />;
}
