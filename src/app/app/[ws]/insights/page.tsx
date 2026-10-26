import Link from "next/link";
import { Lightbulb, ShieldQuestion, Sparkles, Target } from "lucide-react";
import { inWorkspace, loadWorkspace } from "@/server/workspace";
import { getThemeEvidence, insightFilters, listInsights } from "@/server/services/insights-query";
import { listCompetitors } from "@/server/services/competitors";
import { CATEGORIES } from "@/server/services/changes";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { CategoryBadge } from "@/components/app/badges";
import { SaveInsightToggle } from "@/components/app/change-actions";
import { CATEGORY_META, timeAgo } from "@/lib/utils";

export const metadata = { title: "Insights" };

export default async function InsightsPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string>> }) {
  const { ws } = await params;
  const sp = await searchParams;
  const { ctx } = await loadWorkspace(ws);
  const f = insightFilters.parse(sp);
  const { insights, competitors, themeEvidence } = await inWorkspace(ws, async (tx, c) => {
    const insights = await listInsights(tx, c, f);
    const themeIds = insights.filter((i) => i.kind === "theme").flatMap((i) => i.sourceChangeIds);
    return { insights, competitors: await listCompetitors(tx, c, { includeArchived: true }), themeEvidence: await getThemeEvidence(tx, c, themeIds) };
  });
  const base = `/app/${ws}`;
  const themes = insights.filter((i) => i.kind === "theme");
  const analyses = insights.filter((i) => i.kind !== "theme");

  return (
    <>
      <PageHeader title="Insights" description="Interpretations of verified changes. Observed facts come from stored evidence; interpretations are clearly labeled and never treated as fact." />
      <Card className="mb-6 p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filter insights">
          <Select name="competitor" defaultValue={f.competitor ?? ""} aria-label="Competitor" className="lg:col-span-2">
            <option value="">All competitors</option>{competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select name="category" defaultValue={f.category ?? ""} aria-label="Category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_META[c]?.label}</option>)}</Select>
          <Select name="importance" defaultValue={f.importance ?? ""} aria-label="Importance"><option value="">Any importance</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select>
          <Select name="period" defaultValue={f.period} aria-label="Time period"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></Select>
          <Select name="kind" defaultValue={f.kind ?? ""} aria-label="Type"><option value="">All insights</option><option value="change_analysis">Change analyses</option><option value="theme">Emerging themes</option><option value="saved">Saved for reports</option></Select>
          <div className="flex gap-2 lg:col-span-6"><Button type="submit" size="sm">Apply</Button><Button asChild variant="ghost" size="sm"><Link href="?">Reset</Link></Button></div>
        </form>
      </Card>

      {themes.length > 0 ? (
        <section className="mb-8" aria-labelledby="themes-h">
          <h2 id="themes-h" className="mb-3 text-sm font-semibold">Emerging themes</h2>
          <p className="mb-3 text-[13px] text-muted">A theme requires at least 3 verified changes from at least 2 competitors in the same category. The full evidence set is listed.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {themes.map((t) => (
              <Card key={t.id} className="p-5">
                <div className="flex items-center gap-1.5"><Badge tone="blue">Emerging theme</Badge><Badge tone="outline">{t.sourceChangeIds.length} supporting changes</Badge></div>
                <h3 className="mt-2 font-semibold">{t.title}</h3>
                <p className="mt-1 text-[13px] text-muted">{t.interpretation}</p>
                <ul className="mt-3 space-y-1 border-t border-border pt-3 text-[12.5px]">
                  {themeEvidence.filter((e) => t.sourceChangeIds.includes(e.id)).map((e) => (
                    <li key={e.id}><Link href={`${base}/changes/${e.id}`} className="hover:underline"><span className="font-medium">{e.competitorName}:</span> {e.summary}</Link> <span className="text-muted">· {timeAgo(e.detectedAt)}</span></li>
                  ))}
                </ul>
                <p className="mt-3 text-[12px] text-muted"><ShieldQuestion className="mr-1 inline size-3.5" />{t.uncertainty}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="analyses-h">
        <h2 id="analyses-h" className="mb-3 text-sm font-semibold">Change analyses</h2>
        {analyses.length === 0 ? (
          <EmptyState icon={Sparkles} title="No insights for these filters" description="Insights are created automatically when monitoring detects a verified change." />
        ) : (
          <div className="space-y-4">
            {analyses.map((i) => (
              <Card key={i.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={i.importance === "high" ? "red" : i.importance === "medium" ? "amber" : "slate"} className="capitalize">{i.importance}</Badge>
                      {i.category ? <CategoryBadge category={i.category} /> : null}
                      <Badge tone="outline">{i.generatedBy === "ai" ? (ctx.isDemo ? "Sample analysis (demo)" : "AI interpretation") : "Rule-based"}</Badge>
                      {i.competitorName ? <span className="text-[12.5px] font-medium">{i.competitorName}</span> : null}
                      <span className="text-[12px] text-muted">· {timeAgo(i.createdAt)}</span>
                    </div>
                    <h3 className="mt-2 font-semibold">{i.changeId ? <Link href={`${base}/changes/${i.changeId}`} className="hover:underline">{i.title}</Link> : i.title}</h3>
                    <ul className="mt-2 space-y-0.5 text-[13px]">{i.observedFacts.slice(0, 3).map((f, k) => <li key={k} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />{f}</li>)}</ul>
                    <p className="mt-3 flex gap-2 text-[13px] text-muted"><Lightbulb className="mt-0.5 size-4 shrink-0" />{i.interpretation}</p>
                  </div>
                  <div className="space-y-3 text-[13px] lg:w-80 lg:border-l lg:border-border lg:pl-5">
                    <div><p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted"><Target className="size-3.5" />Actions to consider</p><ul className="list-disc space-y-0.5 pl-4">{i.suggestedActions.map((a, k) => <li key={k}>{a}</li>)}</ul></div>
                    <p className="text-[12px] text-muted"><span className="font-medium">Uncertainty:</span> {i.uncertainty}</p>
                    {!ctx.isDemo ? <SaveInsightToggle ws={ws} insightId={i.id} saved={i.savedForReport} /> : i.savedForReport ? <Badge tone="green">Saved for reports</Badge> : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
