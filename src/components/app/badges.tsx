import { AlertTriangle, CheckCircle2, Clock, Lock, PauseCircle, XCircle, Loader } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_META } from "@/lib/utils";

export function CategoryBadge({ category }: { category: string }) {
  const m = CATEGORY_META[category] ?? { label: category, tone: "slate" as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone = severity === "high" ? "red" : severity === "medium" ? "amber" : "slate";
  return <Badge tone={tone} className="capitalize">{severity}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const label = confidence >= 0.85 ? "High confidence" : confidence >= 0.65 ? "Medium confidence" : "Low confidence";
  return <Badge tone="outline" title={`${label} (${pct}%)`}>{pct}% confidence</Badge>;
}

const HEALTH = {
  healthy: { label: "Healthy", icon: CheckCircle2, tone: "green" },
  delayed: { label: "Delayed", icon: Clock, tone: "amber" },
  failed: { label: "Failed", icon: XCircle, tone: "red" },
  paused: { label: "Paused", icon: PauseCircle, tone: "slate" },
  restricted: { label: "Access restricted", icon: Lock, tone: "violet" },
  pending: { label: "Awaiting first check", icon: Loader, tone: "blue" },
} as const;

export function HealthBadge({ health, title }: { health: string; title?: string | null }) {
  const h = HEALTH[health as keyof typeof HEALTH] ?? { label: health, icon: AlertTriangle, tone: "slate" as const };
  return <Badge tone={h.tone} title={title ?? undefined}><h.icon className="size-3" aria-hidden />{h.label}</Badge>;
}

export const HEALTH_META = HEALTH;
