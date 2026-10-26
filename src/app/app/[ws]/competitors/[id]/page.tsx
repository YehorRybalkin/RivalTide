import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, History, Info, Sparkles } from "lucide-react";
import { inWorkspace, loadWorkspace } from "@/server/workspace";
import { getCompetitorProfile } from "@/server/services/competitors";
import { getEntitlements } from "@/server/billing/entitlements";
import { AppError } from "@/server/services/errors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { CategoryBadge, HealthBadge, SeverityBadge } from "@/components/app/badges";
import { FrequencyChart, PriceHistoryChart } from "@/components/app/charts";
import { CompetitorActions, PageActions, AddPageForm } from "@/components/app/competitor-actions";
import { OnboardingSteps } from "@/components/app/onboarding-steps";
import { PAGE_TYPE_LABEL, formatDate, hostname, timeAgo } from "@/lib/utils";

export async function generateMetadata() {
  return { title: "Competitor" };
}

export default async function CompetitorPage({ params, searchParams }: { params: Promise<{ ws: string; id: string }>; searchParams: Promise<{ created?: string; onboarding?: string }> }) {
  const { ws, id } = await params;
  const sp = await searchParams;
  const { ctx } = await loadWorkspace(ws);
  const data = await inWorkspace(ws, async (tx, c) => ({ profile: await getCompetitorProfile(tx, c, id), ent: await getEntitlements(tx, c.orgId) })).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const { competitor: comp, pages, changes, frequency, insights, priceHistory } = data.profile;
  const base = `/app/${ws}`;
  const readOnly = ctx.isDemo || comp.status === "archived";
  const baselineCount = pages.filter((p) => p.snapshotCount >= 1).length;
  const comparable = pages.filter((p) => p.successCount >= 2).length;
  const problemPages = pages.filter((p) => ["failed", "restricted", "delayed"].includes(p.health));

  return (
    <div className="space-y-6">
      {sp.onboarding === "1" ? <div className="hidden lg:block"><OnboardingSteps current={6} /></div> : null}
      {sp.created === "1" ? (
        <Notice tone="success" title="Monitoring is set up">
          {baselineCount} of {pages.length} page{pages.length === 1 ? " has" : "s have"} a baseline snapshot. RivalTide checks each page on a daily schedule; the first comparison becomes possible after the next successful check. You&apos;ll see changes on the overview and in Change history.
          {problemPages.length ? ` ${problemPages.length} page${problemPages.length === 1 ? "" : "s"} could not be checked — see the status column below.` : ""}
        </Notice>
      ) : null}

      <PageHeader
        eyebrow={<Link href={`${base}/competitors`} className="hover:text-foreground">Competitors</Link>}
        title={comp.name}
        description={<a href={comp.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-foreground">{hostname(comp.websiteUrl)}<ExternalLink className="size-3" /></a>}
        actions={!ctx.isDemo ? <CompetitorActions ws={ws} competitor={{ id: comp.id, name: comp.name, websiteUrl: comp.websiteUrl, description: comp.description, category: comp.category, industry: comp.industry, notes: comp.notes, status: comp.status }} /> : null}
      />

      {comp.status !== "active" ? <Notice tone="warning">{comp.status === "paused" ? "Monitoring is paused for this competitor. No scheduled checks will run until you resume." : "This competitor is archived. Its history is kept; restore it to resume monitoring."}</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader className="pb-4">
              <div><CardTitle>Monitored pages</CardTitle><CardDescription>{pages.length} page{pages.length === 1 ? "" : "s"} · {comparable} with comparisons available · checked every {pages[0]?.checkIntervalHours ?? 24}h</CardDescription></div>
            </CardHeader>
            <Table>
              <THead><tr><TH>Page</TH><TH>Status</TH><TH>Last successful fetch</TH><TH>Last attempt</TH><TH>Checks</TH><TH className="text-right"><span className="sr-only">Actions</span></TH></tr></THead>
              <tbody>
                {pages.map((p) => (
                  <TR key={p.id}>
                    <TD className="max-w-[280px]">
                      <div className="flex items-center gap-1.5"><span className="font-medium">{p.label || PAGE_TYPE_LABEL[p.pageType]}</span>{p.renderMode === "browser" ? <Badge tone="outline">JS render</Badge> : null}</div>
                      <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-xs text-muted hover:text-foreground">{p.url}</a>
                    </TD>
                    <TD>
                      <HealthBadge health={p.status === "paused" ? "paused" : p.health} title={p.healthDetail} />
                      {p.activeJob ? <div className="mt-1 text-[11px] text-muted">Check {p.activeJob}</div> : null}
                      {p.healthDetail && p.health !== "healthy" ? <div className="mt-1 max-w-[220px] text-[11px] leading-snug text-muted">{p.healthDetail}</div> : null}
                    </TD>
                    <TD className="whitespace-nowrap text-muted" title={formatDate(p.lastSuccessAt, true)}>{p.lastSuccessAt ? timeAgo(p.lastSuccessAt) : "Never"}</TD>
                    <TD className="whitespace-nowrap text-muted" title={formatDate(p.lastAttemptAt, true)}>{p.lastAttemptAt ? timeAgo(p.lastAttemptAt) : "Never"}</TD>
                    <TD className="tabular text-muted" title={`${p.successCount} successful checks, ${p.snapshotCount} stored snapshots (unchanged checks do not store a new snapshot)`}>{p.successCount}{p.successCount < 2 ? <span className="block text-[11px]">{p.successCount === 1 ? "baseline only" : "not yet checked"}</span> : <span className="block text-[11px]">{p.snapshotCount} snapshot{p.snapshotCount === 1 ? "" : "s"}</span>}</TD>
                    <TD className="text-right">{!readOnly ? <PageActions ws={ws} page={{ id: p.id, status: p.status }} /> : null}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            {!readOnly ? <div className="border-t border-border px-5 py-4"><AddPageForm ws={ws} competitorId={comp.id} websiteUrl={comp.websiteUrl} browserAllowed={data.ent.limits.browserRendering} /></div> : null}
          </Card>

          <Card>
            <CardHeader>
              <div><CardTitle>Recent changes</CardTitle><CardDescription>Verified changes on this competitor&apos;s monitored pages</CardDescription></div>
              <Link href={`${base}/changes?competitor=${comp.id}`} className="text-[13px] text-accent hover:underline">All changes</Link>
            </CardHeader>
            <CardContent className="pt-3">
              {changes.length === 0 ? (
                <p className="flex items-center gap-2 text-[13px] text-muted"><History className="size-4" /> No changes yet. Comparisons start after each page has two successful snapshots.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {changes.map((c) => (
                    <li key={c.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-3">
                      <div className="flex shrink-0 gap-1.5"><CategoryBadge category={c.category} /><SeverityBadge severity={c.severity} /></div>
                      <Link href={`${base}/changes/${c.id}`} className="flex-1 text-[13.5px] hover:underline">{c.summary}</Link>
                      <span className="shrink-0 text-xs text-muted">{PAGE_TYPE_LABEL[c.pageType]} · {timeAgo(c.detectedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {priceHistory.length > 0 ? (
            <Card>
              <CardHeader><div><CardTitle>Published price history</CardTitle><CardDescription>Standard prices parsed with plan and billing period from pricing-page snapshots. Promotional and struck-through prices are excluded; currencies are not converted.</CardDescription></div></CardHeader>
              <CardContent><PriceHistoryChart points={priceHistory} /></CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              {comp.description ? <p className="text-muted">{comp.description}</p> : null}
              <dl className="grid grid-cols-[110px_1fr] gap-y-2">
                <dt className="text-muted">Category</dt><dd>{comp.category ?? "—"}</dd>
                <dt className="text-muted">Industry</dt><dd>{comp.industry ?? "—"}</dd>
                <dt className="text-muted">Monitoring since</dt><dd>{formatDate(comp.createdAt)}</dd>
                <dt className="text-muted">Status</dt><dd className="capitalize">{comp.status}</dd>
              </dl>
              {comp.notes ? <div className="rounded-lg bg-surface-2 p-3"><p className="mb-1 text-xs font-medium text-muted">Team notes</p><p className="whitespace-pre-wrap">{comp.notes}</p></div> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Change frequency</CardTitle><CardDescription>Verified changes per week (12 weeks)</CardDescription></div></CardHeader>
            <CardContent>{frequency.length ? <FrequencyChart data={frequency.map((f) => ({ week: new Date(f.week).toISOString(), count: f.count }))} /> : <p className="text-[13px] text-muted">No changes recorded yet.</p>}</CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Insights</CardTitle><Sparkles className="size-4 text-muted" /></CardHeader>
            <CardContent className="space-y-2">
              {insights.length === 0 ? <p className="text-[13px] text-muted">Insights appear when verified changes are detected.</p> : insights.map((i) => (
                <Link key={i.id} href={`${base}/insights`} className="block rounded-lg border border-border p-3 text-[13px] hover:bg-surface-2/60">
                  <div className="mb-1 flex gap-1.5"><Badge tone={i.importance === "high" ? "red" : i.importance === "medium" ? "amber" : "slate"} className="capitalize">{i.importance}</Badge><Badge tone="outline">{i.generatedBy === "ai" ? (ctx.isDemo ? "Sample analysis" : "AI") : "Rule-based"}</Badge></div>
                  {i.title}
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Sources</CardTitle><Info className="size-4 text-muted" /></CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-[12.5px]">
                {pages.map((p) => <li key={p.id}><a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent hover:underline">{p.url}</a></li>)}
              </ul>
              <p className="mt-3 text-[11.5px] text-muted">Only these pages are monitored. Activity elsewhere on {hostname(comp.websiteUrl)} is not captured.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
