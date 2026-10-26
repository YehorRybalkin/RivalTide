import Link from "next/link";
import { Download, ExternalLink, GitCompareArrows } from "lucide-react";
import { inWorkspace, loadWorkspace } from "@/server/workspace";
import { buildComparison, type Comparison } from "@/server/services/compare";
import { listCompetitors } from "@/server/services/competitors";
import { getEntitlements } from "@/server/billing/entitlements";
import { AppError } from "@/server/services/errors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { CriteriaManager, CellEditor } from "@/components/app/compare-tools";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Compare" };

const SOURCE_LABEL: Record<string, { label: string; tone: "green" | "amber" | "blue" | "slate" }> = {
  observed: { label: "Observed", tone: "green" },
  derived: { label: "Derived", tone: "blue" },
  competitor_claim: { label: "Competitor claim", tone: "amber" },
  validated: { label: "Validated", tone: "green" },
  user_note: { label: "Team note", tone: "slate" },
};

export default async function ComparePage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ c?: string | string[] }> }) {
  const { ws } = await params;
  const sp = await searchParams;
  const { ctx } = await loadWorkspace(ws);
  const selected = (Array.isArray(sp.c) ? sp.c : sp.c ? [sp.c] : []).slice(0, 5);
  const { competitors, comparison, error, ent } = await inWorkspace(ws, async (tx, c) => {
    const competitors = await listCompetitors(tx, c);
    let comparison: Comparison | null = null;
    let error: string | null = null;
    const ids = selected.length ? selected : competitors.slice(0, Math.min(4, competitors.length)).map((x) => x.id);
    if (ids.length >= 2) {
      try { comparison = await buildComparison(tx, c, ids); } catch (e) { if (e instanceof AppError) error = e.message; else throw e; }
    }
    return { competitors, comparison, error, ent: await getEntitlements(tx, c.orgId) };
  });
  const ids = comparison?.competitors.map((c) => c.id) ?? [];
  const exportHref = `/app/${ws}/compare/export?${ids.map((id) => `c=${id}`).join("&")}`;

  return (
    <>
      <PageHeader title="Compare competitors" description="Side-by-side view of verified, published information. Missing data is shown as “Not available”, never as “No”."
        actions={comparison ? <Button asChild variant="secondary" size="sm"><a href={exportHref}><Download /> Export CSV</a></Button> : null} />
      {competitors.length < 2 ? (
        <EmptyState icon={GitCompareArrows} title="Add at least two competitors to compare" description="Comparisons use the latest successful snapshots of each competitor's monitored pages." />
      ) : (
        <>
          <Card className="mb-4 p-4">
            <form method="get" className="flex flex-wrap items-center gap-2" aria-label="Choose competitors to compare">
              <span className="mr-1 text-[13px] text-muted">Compare (2–5):</span>
              {competitors.map((c) => (
                <label key={c.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[13px] has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="checkbox" name="c" value={c.id} defaultChecked={ids.includes(c.id)} className="size-3.5 accent-[var(--primary)]" />{c.name}
                </label>
              ))}
              <Button type="submit" size="sm" className="ml-auto">Update</Button>
            </form>
          </Card>
          {error ? <Notice tone="warning" className="mb-4">{error}</Notice> : null}
          {comparison ? (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead className="border-b border-border bg-surface-2/60">
                    <tr>
                      <th scope="col" className="sticky left-0 z-10 w-56 bg-surface-2 px-4 py-3 text-left text-xs font-medium text-muted">Criterion</th>
                      {comparison.competitors.map((c) => <th key={c.id} scope="col" className="px-4 py-3 text-left font-semibold"><Link href={`/app/${ws}/competitors/${c.id}`} className="hover:underline">{c.name}</Link></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.rows.map((r) => (
                      <tr key={r.key} className="border-b border-border align-top last:border-0">
                        <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-3 text-left font-medium">
                          {r.label}{r.hint ? <span className="mt-0.5 block text-[11.5px] font-normal text-muted">{r.hint}</span> : null}
                        </th>
                        {comparison.competitors.map((c) => {
                          const cell = r.cells[c.id]!;
                          const src = cell.source ? SOURCE_LABEL[cell.source] : null;
                          return (
                            <td key={c.id} className="px-4 py-3">
                              {cell.value === null ? <span className="text-subtle italic">Not available</span> : <span className="font-medium">{cell.value}</span>}
                              {cell.items?.length ? <ul className="mt-1 space-y-0.5 text-[12.5px] text-muted">{cell.items.map((it, i) => <li key={i}>{it}</li>)}</ul> : null}
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {src && cell.value !== null ? <Badge tone={src.tone}>{src.label}</Badge> : null}
                                {cell.snapshotId ? <Link href={`/app/${ws}/snapshots/${cell.snapshotId}`} className="text-[11.5px] text-accent hover:underline">Evidence{cell.asOf ? ` · ${formatDate(cell.asOf)}` : ""}</Link> : null}
                                {cell.evidenceUrl && !cell.snapshotId ? <a href={cell.evidenceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 text-[11.5px] text-accent hover:underline">Source<ExternalLink className="size-3" /></a> : null}
                                {r.criterionId && !ctx.isDemo ? <CellEditor ws={ws} criterionId={r.criterionId} competitorId={c.id} competitorName={c.name} criterion={r.label} value={cell.value} source={cell.source} evidenceUrl={cell.evidenceUrl ?? null} /> : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {!ctx.isDemo ? <CriteriaManager ws={ws} criteria={comparison?.rows.filter((r) => r.criterionId).map((r) => ({ id: r.criterionId!, name: r.label })) ?? []} /> : null}
            <Card className="p-5 text-[13px] text-muted">
              <p className="font-medium text-foreground">How to read this matrix</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li><Badge tone="green">Observed</Badge> values are parsed from stored snapshots.</li>
                <li><Badge tone="amber">Competitor claim</Badge> values are what the competitor says about itself — not independently validated.</li>
                <li>No rankings or market-share estimates are produced.</li>
                {!ent.limits.advancedComparison ? <li>Custom criteria are available on every plan; advanced comparisons are part of the Agency plan.</li> : null}
              </ul>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
