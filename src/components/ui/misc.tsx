import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong px-6 py-12 text-center", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-surface-2 text-muted"><Icon className="size-5" aria-hidden /></div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-[13px] text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-medium text-muted">{eyebrow}</div> : null}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-[13.5px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children?: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-accent/25 bg-accent-soft text-accent-soft-foreground",
    warning: "border-warning/30 bg-warning-soft text-warning-soft-foreground",
    danger: "border-danger/30 bg-danger-soft text-danger-soft-foreground",
    success: "border-primary/30 bg-primary-soft text-primary-soft-foreground",
  };
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-[13px]", tones[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      {title ? <div className="font-semibold">{title}</div> : null}
      {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone = "default" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: "default" | "green" | "amber" | "red" | "blue" }) {
  const iconTone = { default: "bg-surface-2 text-muted", green: "bg-primary-soft text-primary-soft-foreground", amber: "bg-warning-soft text-warning-soft-foreground", red: "bg-danger-soft text-danger-soft-foreground", blue: "bg-accent-soft text-accent-soft-foreground" }[tone];
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-muted">{label}</span>
        {Icon ? <span className={cn("flex size-7 items-center justify-center rounded-md", iconTone)}><Icon className="size-3.5" aria-hidden /></span> : null}
      </div>
      <div className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{children}</kbd>;
}
