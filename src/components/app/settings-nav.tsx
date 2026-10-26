"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsNav({ ws }: { ws: string }) {
  const pathname = usePathname();
  const items = [
    ["account", "Account"], ["organization", "Organization & team"], ["workspace", "This workspace"], ["workspaces", "Client workspaces"],
    ["notifications", "Notifications"], ["billing", "Plan & billing"], ["privacy", "Privacy & data"],
  ] as const;
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map(([slug, label]) => {
        const href = `/app/${ws}/settings/${slug}`;
        const active = pathname === href;
        return <Link key={slug} href={href} aria-current={active ? "page" : undefined} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-[13.5px] text-muted hover:bg-surface-2 hover:text-foreground", active && "bg-surface-2 font-medium text-foreground")}>{label}</Link>;
      })}
    </nav>
  );
}
