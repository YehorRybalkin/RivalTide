import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ExternalLink, FileSearch, Lightbulb, ShieldQuestion, Sparkles, Target, Users } from "lucide-react";
import { inWorkspace, loadWorkspace } from "@/server/workspace";
import { getChange, getInsightForChange } from "@/server/services/changes";
import { AppError } from "@/server/services/errors";
import { describePriceChange } from "@/server/detection/pricing";
import { isAiConfigured } from "@/server/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Notice, PageHeader } from "@/components/ui/misc";
import { CategoryBadge, ConfidenceBadge, HealthBadge, SeverityBadge } from "@/components/app/badges";
import { ChangeReviewActions, RegenerateInsight, SaveInsightToggle } from "@/components/app/change-actions";
import { DiffViewer } from "@/components/app/diff-viewer";
import { PAGE_TYPE_LABEL, formatDate, timeAgo } from "@/lib/utils";

export const metadata = { title: "Change evidence" };

export default async function ChangeDetailPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const { ctx } = await loadWorkspace(ws);
  const { change: c, insight } = await inWorkspace(ws, async (tx, cx) => {
    const change = await getChange(tx, cx, id);
    return { change, insight: await getInsightForChange(tx, cx, id) };
  }).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const base = `/app/${ws}`;
  const ev = c.evidence;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<><Link href={`${base}/changes`} className="hover:text-foreground">Change history</Link> / <Link href={`${base}/competitors/${c.competitorId}`} className="hover:text-foreground">{c.competitorName}</Link></>}
        title={c.summary}
        actions={!ctx.isDemo ? <ChangeReviewActions ws={ws} changeId={c.id} reviewStatus={c.reviewStatus} feedback={c.feedback} /> : null}
      />
      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={c.category} />
        <SeverityBadge severity={c.severity} />
        <ConfidenceBadge confidence={c.confidence} />
        {c.needsReview ? <Badge tone="red"><AlertTriangle className="size-3" /> Low confidence — please review</Badge> : null}
        {c.reviewStatus !== "new" ? <Badge tone="outline" className="capitalize">{c.reviewStatus}</Badge> : null}
        {c.feedback ? <Badge tone="outline">Feedback: {c.feedback}</Badge> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {ev.priceChanges.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Parsed pricing changes</CardTitle></CardHeader>
              <CardContent className="pt-3">
                <ul className="space-y-2 text-[13.5px]">
                  {ev.priceChanges.map((p, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <Badge tone={p.kind === "amount_changed" ? "green" : "slate"}>{p.kind.replace("_", " ")}</Badge>
                      <span>{describePriceChange(p)}</span>
                      <Badge tone="outline">{p.confidence} confidence</Badge>
                      {p.note && p.kind === "currency_changed" ? <span className="text-xs text-muted">{p.note}</span> : null}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted">Prices are compared only when plan, billing period and billing frequency match. Promotional and struck-through prices are tracked separately. No currency conversion is applied.</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Before vs after</CardTitle>
                <p className="mt-1 text-[13px] text-muted">{ev.stats.addedBlocks} added · {ev.stats.removedBlocks} removed · {ev.stats.modifiedBlocks} modified content blocks{ev.stats.truncated ? " (evidence truncated to the first 40 of each)" : ""}</p>
              </div>
            </CardHeader>
            <CardContent className="pt-4"><DiffViewer evidence={ev} /></CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Evidence record</CardTitle><FileSearch className="size-4 text-muted" /></CardHeader>
            <CardContent className="pt-3">
              <dl className="grid grid-cols-[120px_1fr] gap-y-2.5 text-[13px]">
                <dt className="text-muted">Source page</dt>
                <dd className="min-w-0"><a href={c.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all text-accent hover:underline">{c.sourceUrl}<ExternalLink className="size-3 shrink-0" /></a></dd>
                <dt className="text-muted">Page type</dt><dd>{PAGE_TYPE_LABEL[c.pageType]}</dd>
                <dt className="text-muted">Detected</dt><dd title={formatDate(c.detectedAt, true)}>{formatDate(c.detectedAt, true)}</dd>
                <dt className="text-muted">Previous snapshot</dt><dd><Link href={`${base}/snapshots/${c.previousSnapshotId}`} className="text-accent hover:underline">{formatDate(c.previousFetchedAt, true)}</Link><span className="block font-mono text-[11px] text-muted">{c.previousHash.slice(0, 16)}</span></dd>
                <dt className="text-muted">New snapshot</dt><dd><Link href={`${base}/snapshots/${c.newSnapshotId}`} className="text-accent hover:underline">{formatDate(c.newFetchedAt, true)}</Link><span className="block font-mono text-[11px] text-muted">{c.newHash.slice(0, 16)}</span></dd>
                <dt className="text-muted">Method</dt><dd>{c.detectionMethod.replace(/\+/g, " + ")}</dd>
                <dt className="text-muted">Page status</dt><dd><HealthBadge health={c.pageHealth} /> <span className="block text-[11.5px] text-muted">Last success {timeAgo(c.pageLastSuccessAt)}</span></dd>
              </dl>
              <p className="mt-4 rounded-lg bg-surface-2 p-3 text-[12px] text-muted">Both snapshots are retained as evidence and are never modified. Reports that include this change keep a frozen copy of this evidence.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><CardTitle>Analysis</CardTitle></div>
              {insight ? <Badge tone="outline">{insight.generatedBy === "ai" ? (ctx.isDemo ? "Sample analysis (demo)" : `AI · ${insight.model ?? ""}`) : "Rule-based"}</Badge> : null}
            </CardHeader>
            <CardContent className="space-y-4 pt-3 text-[13px]">
              {!insight ? <p className="text-muted">No analysis yet.</p> : (
                <>
                  <section>
                    <h3 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Observed facts (from evidence)</h3>
                    <ul className="space-y-1">{insight.observedFacts.map((f, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />{f}</li>)}</ul>
                  </section>
                  <section className="rounded-lg border border-dashed border-border-strong p-3">
                    <h3 className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted"><Lightbulb className="size-3.5" /> Interpretation</h3>
                    <p>{insight.interpretation}</p>
                    {insight.whoAffected ? <p className="mt-2 flex gap-1.5 text-muted"><Users className="mt-0.5 size-3.5 shrink-0" />{insight.whoAffected}</p> : null}
                  </section>
                  {insight.opportunities.length || insight.threats.length ? (
                    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      {insight.opportunities.length ? <div><h3 className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-primary-soft-foreground">Possible opportunities</h3><ul className="list-disc space-y-1 pl-4">{insight.opportunities.map((o, i) => <li key={i}>{o}</li>)}</ul></div> : null}
                      {insight.threats.length ? <div><h3 className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-danger-soft-foreground">Possible threats</h3><ul className="list-disc space-y-1 pl-4">{insight.threats.map((o, i) => <li key={i}>{o}</li>)}</ul></div> : null}
                    </section>
                  ) : null}
                  <section>
                    <h3 className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted"><Target className="size-3.5" /> Actions to consider</h3>
                    <ul className="list-disc space-y-1 pl-4">{insight.suggestedActions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                  </section>
                  <section className="flex gap-2 rounded-lg bg-warning-soft p-3 text-warning-soft-foreground">
                    <ShieldQuestion className="mt-0.5 size-4 shrink-0" />
                    <div><span className="font-semibold">Uncertainty: </span>{insight.uncertainty}</div>
                  </section>
                </>
              )}
              {!ctx.isDemo ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {insight ? <SaveInsightToggle ws={ws} insightId={insight.id} saved={insight.savedForReport} /> : null}
                  <RegenerateInsight ws={ws} changeId={c.id} aiConfigured={isAiConfigured()} />
                </div>
              ) : null}
              {!isAiConfigured() && !ctx.isDemo ? <Notice tone="info">AI analysis is not configured on this server, so a rule-based summary is shown. Monitoring and evidence work fully without AI.</Notice> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
