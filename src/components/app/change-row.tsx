import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { CategoryBadge, ConfidenceBadge, SeverityBadge } from "./badges";
import { Badge } from "@/components/ui/badge";
import { PAGE_TYPE_LABEL, cn, formatDate, timeAgo } from "@/lib/utils";
import type { ChangeListItem } from "@/server/services/changes";

export function ChangeRow({ c, wsId, compact }: { c: ChangeListItem; wsId: string; compact?: boolean }) {
  return (
    <li className={cn("group relative flex gap-3 px-5 py-4 transition-colors hover:bg-surface-2/60", !c.isRead && "bg-accent-soft/30")}>
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", c.severity === "high" ? "bg-danger" : c.severity === "medium" ? "bg-warning" : "bg-border-strong")} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-semibold">{c.competitorName}</span>
          <span className="text-[12px] text-muted">· {PAGE_TYPE_LABEL[c.pageType] ?? c.pageType}</span>
          <CategoryBadge category={c.category} />
          {!compact ? <SeverityBadge severity={c.severity} /> : null}
          {c.needsReview && c.reviewStatus === "new" ? <Badge tone="red">Needs review</Badge> : null}
          {c.reviewStatus === "reviewed" ? <Badge tone="outline">Reviewed</Badge> : null}
          {!c.isRead ? <span className="sr-only">Unread</span> : null}
        </div>
        <Link href={`/app/${wsId}/changes/${c.id}`} className="mt-1 block text-[13.5px] leading-snug text-foreground after:absolute after:inset-0 hover:underline focus-visible:outline-none">
          {c.summary}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          <time dateTime={new Date(c.detectedAt).toISOString()} title={formatDate(c.detectedAt, true)}>Detected {timeAgo(c.detectedAt)}</time>
          {!compact ? <ConfidenceBadge confidence={c.confidence} /> : null}
          {!compact ? (
            <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="relative z-10 inline-flex items-center gap-1 hover:text-foreground">
              {c.sourceUrl.replace(/^https?:\/\//, "").slice(0, 60)}<ExternalLink className="size-3" aria-hidden /><span className="sr-only">(opens in new tab)</span>
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}
