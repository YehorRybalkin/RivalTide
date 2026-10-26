import Link from "next/link";
import { Building2, FileText, Globe, Plus, TriangleAlert, Users } from "lucide-react";
import { loadWorkspace } from "@/server/workspace";
import { withUser } from "@/server/db";
import { getAgencyOverview } from "@/server/services/dashboard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Agency overview" };

export default async function AgencyPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { user, ctx } = await loadWorkspace(ws);
  const rows = await withUser(user.id, (tx) => getAgencyOverview(tx, ctx.orgId));
  const sum = (k: "competitors" | "pages" | "changes7d" | "highChanges7d" | "problemPages" | "draftReports") => rows.reduce((n, r) => n + r[k], 0);
  return (
    <>
      <PageHeader title="Agency overview" description={`All client workspaces in ${ctx.orgName}. Client data stays separated per workspace.`}
        actions={!ctx.isDemo ? <Button asChild size="sm"><Link href={`/app/${ws}/settings/workspaces`}><Plus /> New client workspace</Link></Button> : null} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Clients" value={rows.length} icon={Users} />
        <Stat label="Competitors" value={sum("competitors")} icon={Building2} tone="blue" />
        <Stat label="Important changes (7d)" value={sum("highChanges7d")} hint={`${sum("changes7d")} changes total`} icon={TriangleAlert} tone="amber" />
        <Stat label="Reports awaiting review" value={sum("draftReports")} hint="Draft reports" icon={FileText} />
        <Stat label="Pages with issues" value={sum("problemPages")} hint={`of ${sum("pages")} active`} icon={Globe} tone={sum("problemPages") ? "red" : "green"} />
      </div>
      <Card className="overflow-hidden">
        <Table>
          <THead><tr><TH>Client workspace</TH><TH className="text-right">Competitors</TH><TH className="text-right">Pages</TH><TH className="text-right">Changes (7d)</TH><TH>Monitoring</TH><TH>Drafts</TH><TH>Last change</TH></tr></THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><Link href={`/app/${r.id}`} className="font-medium hover:underline">{r.name}</Link>{r.clientName ? <div className="text-xs text-muted">{r.clientName}</div> : null}</TD>
                <TD className="tabular text-right">{r.competitors}</TD>
                <TD className="tabular text-right">{r.pages}</TD>
                <TD className="tabular text-right">{r.changes7d}{r.highChanges7d ? <Badge tone="red" className="ml-2">{r.highChanges7d} high</Badge> : null}</TD>
                <TD>{r.problemPages ? <Badge tone="amber">{r.problemPages} issue{r.problemPages > 1 ? "s" : ""}</Badge> : r.pages ? <Badge tone="green">Healthy</Badge> : <Badge>No pages</Badge>}</TD>
                <TD className="tabular">{r.draftReports ? <Link href={`/app/${r.id}/reports`} className="text-accent hover:underline">{r.draftReports} draft</Link> : "—"}</TD>
                <TD className="text-muted">{r.lastChangeAt ? timeAgo(r.lastChangeAt) : "—"}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      <p className="mt-4 text-[12.5px] text-muted">End-client logins are not available yet; share reports as PDFs. The data model keeps workspaces separable so client access can be added later.</p>
    </>
  );
}
