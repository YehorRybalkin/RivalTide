import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { inWorkspace, loadWorkspace } from "@/server/workspace";
import { listCompetitors } from "@/server/services/competitors";
import { getEntitlements, getUsage } from "@/server/billing/entitlements";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UsageMeter } from "@/components/app/usage-meter";
import { hostname, timeAgo } from "@/lib/utils";

export const metadata = { title: "Competitors" };

export default async function CompetitorsPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ archived?: string }> }) {
  const { ws } = await params;
  const { archived } = await searchParams;
  const { ctx } = await loadWorkspace(ws);
  const { list, ent, usage } = await inWorkspace(ws, async (tx, c) => ({
    list: await listCompetitors(tx, c, { includeArchived: archived === "1" }),
    ent: await getEntitlements(tx, c.orgId),
    usage: await getUsage(tx, c.orgId),
  }));
  const base = `/app/${ws}`;
  return (
    <>
      <PageHeader title="Competitors" description="Companies you monitor in this workspace."
        actions={!ctx.isDemo ? <Button asChild><Link href={`${base}/competitors/new`}><Plus /> Add competitor</Link></Button> : null} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <UsageMeter label="Competitors (organization)" used={usage.competitors} limit={ent.limits.competitors} />
        <UsageMeter label="Monitored pages (organization)" used={usage.pages} limit={ent.limits.pages} />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={Building2} title="No competitors yet" description="Add a competitor's website and choose which pages to watch. RivalTide only monitors pages that allow automated access."
          action={!ctx.isDemo ? <Button asChild><Link href={`${base}/competitors/new`}><Plus /> Add competitor</Link></Button> : undefined} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead><tr><TH>Competitor</TH><TH>Pages</TH><TH>Monitoring</TH><TH className="text-right">Changes (30d)</TH><TH>Last change</TH><TH>Last successful check</TH></tr></THead>
            <tbody>
              {list.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`${base}/competitors/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                    <div className="text-xs text-muted">{hostname(c.websiteUrl)}{c.category ? ` · ${c.category}` : ""}</div>
                  </TD>
                  <TD className="tabular">{c.pageCount}</TD>
                  <TD>
                    {c.status === "archived" ? <Badge>Archived</Badge> : c.status === "paused" ? <Badge>Paused</Badge>
                      : c.problemPages ? <Badge tone="amber">{c.problemPages} page issue{c.problemPages > 1 ? "s" : ""}</Badge>
                      : c.healthyPages ? <Badge tone="green">Healthy</Badge> : <Badge tone="blue">Awaiting first check</Badge>}
                  </TD>
                  <TD className="tabular text-right">{c.changes30d}</TD>
                  <TD className="text-muted">{c.lastChangeAt ? timeAgo(c.lastChangeAt) : "—"}</TD>
                  <TD className="text-muted">{c.lastSuccessAt ? timeAgo(c.lastSuccessAt) : "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <p className="mt-4 text-[13px] text-muted">
        {archived === "1" ? <Link href={`${base}/competitors`} className="text-accent hover:underline">Hide archived competitors</Link> : <Link href={`${base}/competitors?archived=1`} className="text-accent hover:underline">Show archived competitors</Link>}
      </p>
    </>
  );
}
