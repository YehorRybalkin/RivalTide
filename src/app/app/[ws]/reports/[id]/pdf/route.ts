import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { withUser } from "@/server/db";
import { resolveWorkspace } from "@/server/services/context";
import { getReport } from "@/server/services/reports";
import { getEntitlements, requireFeature, EntitlementError } from "@/server/billing/entitlements";
import { AppError } from "@/server/services/errors";
import { recordUsage } from "@/server/audit";
import { renderReportPdf } from "@/server/reports/pdf";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const report = await withUser(user.id, async (tx) => {
      const ctx = await resolveWorkspace(tx, user.id, ws);
      requireFeature(await getEntitlements(tx, ctx.orgId), "pdfReports");
      const r = await getReport(tx, ctx, id);
      await recordUsage(tx, ctx.orgId, "report_pdf", 1, 0, { reportId: id });
      return r;
    });
    const pdf = await renderReportPdf(report.content);
    const name = report.title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").slice(0, 80) || "report";
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}-v${report.version}.pdf"`, "cache-control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof EntitlementError) return NextResponse.json({ error: e.message }, { status: 402 });
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
