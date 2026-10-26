import Link from "next/link";
import { Activity, Building2, CircleDollarSign, Globe, Layers, Plus, Radar, Sparkles, TriangleAlert } from "lucide-react";
import { inWorkspace, loadWorkspace } from "@/server/workspace";
import { getDashboard } from "@/server/services/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { CategoryDonut, WeeklyActivityChart } from "@/components/app/charts";
import { ChangeRow } from "@/components/app/change-row";
import { HEALTH_META } from "@/components/app/badges";
import { cn, hostname, timeAgo } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function DashboardPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { ctx } = await loadWorkspace(ws);
  const d = await inWorkspace(ws, (tx, c) => getDashboard(tx, c));
  const base = `/app/${ws}`;
  const totalPages = Object.values(d.health).reduce((a, b) => a + b, 0);

  if (d.stats.competitors === 0) {
    return (
      <>
        <PageHeader title={ctx.workspaceName} description="Your competitive intelligence overview." />
        <EmptyState icon={Radar} title="Add your first competitor" description="RivalTide will check the pages you choose on a daily schedule and show verified changes here. Comparisons begin after the second successful check of a page."
          action={!ctx.isDemo ? <Button asChild><Link href={`${base}/competitors/new`}><Plus /> Add competitor</Link></Button> : undefined} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ctx.workspaceName}
        description={<>Last check {timeAgo(d.lastCheckAt)} · Pages are checked on a daily schedule.</>}
        actions={<>
          <Button asChild variant="secondary" size="sm"><Link href={`${base}/reports`}>Generate report</Link></Button>
          {!ctx.isDemo ? <Button asChild size="sm"><Link href={`${base}/competitors/new`}><Plus /> Add competitor</Link></Button> : null}
        </>}
      />

      {d.firstBaselinePending > 0 ? (
        <Notice tone="info" title={`${d.firstBaselinePending} page${d.firstBaselinePending === 1 ? " is" : "s are"} still building a baseline`}>
          Changes can only be detected once a page has two successful snapshots. The next scheduled check will make comparisons possible.
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Competitors" value={d.stats.competitors} icon={Building2} />
        <Stat label="Active pages" value={d.stats.activePages} icon={Globe} tone="blue" />
        <Stat label="Important this week" value={d.stats.importantThisWeek} hint="Medium & high severity" icon={TriangleAlert} tone="amber" />
        <Stat label="Pricing changes" value={d.stats.pricingChanges30d} hint="Last 30 days" icon={CircleDollarSign} tone="green" />
        <Stat label="Product & features" value={d.stats.productChanges30d} hint="Last 30 days" icon={Layers} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <div><CardTitle>Competitive activity</CardTitle><CardDescription>Verified changes, newest first{d.stats.unread ? ` · ${d.stats.unread} unread` : ""}</CardDescription></div>
            <Button asChild variant="ghost" size="sm"><Link href={`${base}/changes`}>View all</Link></Button>
          </CardHeader>
          {d.timeline.length ? (
            <ul className="mt-3 divide-y divide-border border-t border-border">{d.timeline.map((c) => <ChangeRow key={c.id} c={c} wsId={ws} compact />)}</ul>
          ) : (
            <CardContent><EmptyState icon={Activity} title="No changes detected yet" description="When a monitored page changes between two successful checks, it appears here with evidence." /></CardContent>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><div><CardTitle>Intelligence highlights</CardTitle><CardDescription>Most relevant developments (30 days)</CardDescription></div><Sparkles className="size-4 text-muted" aria-hidden /></CardHeader>
            <CardContent className="space-y-3">
              {d.highlights.length === 0 ? <p className="text-[13px] text-muted">No highlights yet.</p> : d.highlights.map((h) => (
                <Link key={h.id} href={h.changeId ? `${base}/changes/${h.changeId}` : `${base}/insights`} className="block rounded-lg border border-border p-3 transition-colors hover:border-border-strong hover:bg-surface-2/50">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={h.importance === "high" ? "red" : "amber"} className="capitalize">{h.importance}</Badge>
                    {h.kind === "theme" ? <Badge tone="blue">Emerging theme</Badge> : null}
                    <Badge tone="outline">{h.generatedBy === "ai" ? (ctx.isDemo ? "Sample analysis" : "AI interpretation") : "Rule-based"}</Badge>
                  </div>
                  <p className="mt-2 text-[13px] font-medium leading-snug">{h.title}</p>
                  <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{h.interpretation}</p>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Monitoring status</CardTitle><CardDescription>{totalPages} monitored pages</CardDescription></div></CardHeader>
            <CardContent>
              <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                {(["healthy", "pending", "delayed", "restricted", "failed", "paused"] as const).map((k) => d.health[k] ? (
                  <div key={k} style={{ width: `${(d.health[k] / Math.max(1, totalPages)) * 100}%` }} className={cn({ healthy: "bg-primary", pending: "bg-accent", delayed: "bg-warning", restricted: "bg-violet-500", failed: "bg-danger", paused: "bg-subtle" }[k])} />
                ) : null)}
              </div>
              <ul className="grid grid-cols-2 gap-2 text-[13px]">
                {(["healthy", "delayed", "failed", "paused", "restricted", "pending"] as const).map((k) => {
                  const M = HEALTH_META[k];
                  return <li key={k} className="flex items-center gap-2"><M.icon className="size-3.5 text-muted" aria-hidden /><span className="flex-1 text-muted">{M.label}</span><span className="tabular font-medium">{d.health[k]}</span></li>;
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader><div><CardTitle>Activity by category</CardTitle><CardDescription>Verified changes per week (8 weeks)</CardDescription></div></CardHeader>
          <CardContent><WeeklyActivityChart data={d.weekly} /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Last 30 days</CardTitle><CardDescription>Share of changes by category</CardDescription></div></CardHeader>
          <CardContent>{d.byCategory.length ? <CategoryDonut data={d.byCategory} /> : <p className="text-[13px] text-muted">No changes in the last 30 days.</p>}</CardContent>
        </Card>
      </div>

      <section aria-labelledby="competitors-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="competitors-heading" className="text-sm font-semibold">Competitor overview</h2>
          <Button asChild variant="ghost" size="sm"><Link href={`${base}/competitors`}>Manage</Link></Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {d.competitors.map((c) => (
            <Link key={c.id} href={`${base}/competitors/${c.id}`} className="rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-border-strong">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-surface-2 text-[13px] font-semibold">{c.name.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0"><p className="truncate text-[13.5px] font-semibold">{c.name}</p><p className="truncate text-[12px] text-muted">{hostname(c.websiteUrl)}</p></div>
              </div>
              <div className="mt-4 flex items-center justify-between text-[12px] text-muted">
                <span><span className="tabular font-medium text-foreground">{c.changes30d}</span> changes (30d)</span>
                <span>{c.pages} pages{c.problemPages ? <span className="text-danger"> · {c.problemPages} issue{c.problemPages > 1 ? "s" : ""}</span> : null}</span>
              </div>
              <p className="mt-1 text-[12px] text-muted">{c.status === "paused" ? "Monitoring paused" : c.lastChangeAt ? `Last change ${timeAgo(c.lastChangeAt)}` : "No changes yet"}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
