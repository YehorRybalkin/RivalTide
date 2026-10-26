"use client";
import { DropdownMenu as M } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;
export function DropdownContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("z-50 min-w-48 rounded-lg border border-border bg-surface p-1 text-[13px] shadow-pop fade-in", className)} {...props} />
    </M.Portal>
  );
}
export function DropdownItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return <M.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted", className)} {...props} />;
}
export function DropdownLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 py-1.5 text-xs font-medium text-muted", className)} {...props} />;
}
export const DropdownSeparator = (props: React.ComponentProps<typeof M.Separator>) => <M.Separator className="my-1 h-px bg-border" {...props} />;
