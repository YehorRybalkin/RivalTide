import Link from "next/link";
import { FileText } from "lucide-react";
import { inWorkspace, loadWorkspace } from "@/server/workspace";
import { listReports } from "@/server/services/reports";
import { listCompetitors } from "@/server/services/competitors";
import { getEntitlements, getUsage } from "@/server/billing/entitlements";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { GenerateReportForm } from "@/components/app/generate-report-form";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Reports" };

const TYPE_LABEL = { weekly_brief: "Weekly brief", competitor_deep_dive: "Competitor deep dive", client_report: "Client report" } as const;

export default async function ReportsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { ctx } = await loadWorkspace(ws);
  const { reports, competitors, ent, usage } = await inWorkspace(ws, async (tx, c) => ({
    reports: await listReports(tx, c), competitors: await listCompetitors(tx, c), ent: await getEntitlements(tx, c.orgId), usage: await getUsage(tx, c.orgId),
  }));
  return (
    <>
      <PageHeader title="Reports" description="Generate evidence-backed competitor reports. Each generated report is a frozen, versioned record." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>
          {reports.length === 0 ? (
            <EmptyState icon={FileText} title="No reports yet" description="Generate a weekly brief, a competitor deep dive, or a client report. Reports state clearly when monitoring coverage is incomplete." />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <THead><tr><TH>Report</TH><TH>Type</TH><TH>Period</TH><TH>Version</TH><TH>Status</TH><TH>Created</TH></tr></THead>
                <tbody>
                  {reports.map((r) => (
                    <TR key={r.id}>
                      <TD className="min-w-[240px]"><Link href={`/app/${ws}/reports/${r.id}`} className="font-medium hover:underline">{r.title}</Link>{r.creator ? <div className="text-xs text-muted">by {r.creator}</div> : null}</TD>
                      <TD className="whitespace-nowrap text-muted">{TYPE_LABEL[r.type]}</TD>
                      <TD className="whitespace-nowrap text-muted">{formatDate(r.periodStart)} – {formatDate(r.periodEnd)}</TD>
                      <TD className="tabular">v{r.version}</TD>
                      <TD><Badge tone={r.status === "final" ? "green" : "slate"} className="capitalize">{r.status}</Badge></TD>
                      <TD className="whitespace-nowrap text-muted">{formatDate(r.createdAt, true)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
        <GenerateReportForm ws={ws} competitors={competitors.map((c) => ({ id: c.id, name: c.name }))} used={usage.reportsThisMonth} limit={ent.limits.reportsPerMonth} hasClient={!!ctx.workspaceName} />
      </div>
    </>
  );
}
