import { cn } from "@/lib/utils";

export function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between text-[13px]"><span className="text-muted">{label}</span><span className="tabular font-medium">{used} / {limit}</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit} aria-label={label}>
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
