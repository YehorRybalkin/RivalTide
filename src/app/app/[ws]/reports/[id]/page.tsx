import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Lock, Printer, Trash2 } from "lucide-react";
import { inWorkspace, loadWorkspace } from "@/server/workspace";
import { getReport } from "@/server/services/reports";
import { getEntitlements } from "@/server/billing/entitlements";
import { AppError } from "@/server/services/errors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { ReportView } from "@/components/app/report-view";
import { PrintButton } from "@/components/app/print-button";
import { deleteReportAction, finalizeReportAction } from "../../actions";

export const metadata = { title: "Report" };

export default async function ReportPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const { ctx } = await loadWorkspace(ws);
  const { report, ent } = await inWorkspace(ws, async (tx, c) => ({ report: await getReport(tx, c, id), ent: await getEntitlements(tx, c.orgId) })).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          eyebrow={<Link href={`/app/${ws}/reports`} className="hover:text-foreground">Reports</Link>}
          title={report.title}
          description={<span className="inline-flex items-center gap-2">Version {report.version} · <Badge tone={report.status === "final" ? "green" : "slate"} className="capitalize">{report.status}</Badge> · <span className="font-mono text-[11px]">sha256 {report.contentHash.slice(0, 12)}</span></span>}
          actions={<>
            {ent.limits.pdfReports ? <Button asChild size="sm"><a href={`/app/${ws}/reports/${id}/pdf`}><Download /> Download PDF</a></Button> : <Button size="sm" variant="secondary" disabled title="PDF export is included from the Growth plan"><Lock /> PDF (Growth+)</Button>}
            <PrintButton><Printer /> Print</PrintButton>
            {!ctx.isDemo && report.status === "draft" ? (
              <>
                <form action={finalizeReportAction}><input type="hidden" name="ws" value={ws} /><input type="hidden" name="reportId" value={id} /><Button size="sm" variant="secondary" type="submit">Mark final</Button></form>
                <form action={deleteReportAction}><input type="hidden" name="ws" value={ws} /><input type="hidden" name="reportId" value={id} /><Button size="sm" variant="ghost" type="submit" aria-label="Delete draft"><Trash2 /></Button></form>
              </>
            ) : null}
          </>}
        />
      </div>
      <ReportView r={report.content} />
    </>
  );
}
