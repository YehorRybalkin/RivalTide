import { createHash } from "node:crypto";
import { z } from "zod";
import type { Tx } from "../db";
import { audit } from "../audit";
import { assertWithinLimit, getEntitlements } from "../billing/entitlements";
import type { ChangeEvidence } from "../detection/diff";
import { describePriceChange } from "../detection/pricing";
import { assertUuid, type WorkspaceCtx } from "./context";
import { AppError } from "./errors";

export const REPORT_TYPES = ["weekly_brief", "competitor_deep_dive", "client_report"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const reportInput = z.object({
  type: z.enum(REPORT_TYPES),
  periodDays: z.coerce.number().int().min(1).max(366).default(7),
  competitorId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  title: z.string().trim().max(160).optional().transform((v) => v || null),
});

export interface ReportChange {
  id: string;
  competitor: string;
  category: string;
  severity: string;
  confidence: number;
  summary: string;
  sourceUrl: string;
  detectedAt: string;
  previousSnapshotId: string;
  newSnapshotId: string;
  needsReview: boolean;
  evidence: { before: string[]; after: string[]; prices: string[] };
}

export interface ReportInsight {
  id: string;
  title: string;
  importance: string;
  generatedBy: "ai" | "deterministic";
  facts: string[];
  interpretation: string;
  actions: string[];
  uncertainty: string;
  sourceChangeIds: string[];
}

/** Frozen report content. Stored as-is; later website updates never alter it. */
export interface ReportContent {
  schemaVersion: 1;
  type: ReportType;
  title: string;
  workspace: { name: string; clientName: string | null };
  branding: { name: string; color: string; whiteLabel: boolean };
  period: { start: string; end: string };
  generatedAt: string;
  isDemo: boolean;
  coverage: { competitors: number; activePages: number; healthyPages: number; problemPages: number; pagesWithoutComparison: number; notes: string[] };
  executiveSummary: string[];
  competitorOverview: { name: string; website: string; description: string | null; pages: string[]; changes: number }[];
  majorChanges: ReportChange[];
  pricing: ReportChange[];
  product: ReportChange[];
  positioning: ReportChange[];
  otherChanges: ReportChange[];
  insights: ReportInsight[];
  nextActions: string[];
  appendix: { id: string; competitor: string; sourceUrl: string; detectedAt: string; previousSnapshotId: string; newSnapshotId: string }[];
}

const TITLES: Record<ReportType, string> = {
  weekly_brief: "Weekly Competitive Brief",
  competitor_deep_dive: "Competitor Deep Dive",
  client_report: "Competitive Intelligence Report",
};

function evidenceExcerpt(ev: ChangeEvidence) {
  return {
    before: [...ev.modified.map((m) => m.before), ...ev.removed.map((r) => r.t)].slice(0, 4).map((t) => t.slice(0, 280)),
    after: [...ev.modified.map((m) => m.after), ...ev.added.map((a) => a.t)].slice(0, 4).map((t) => t.slice(0, 280)),
    prices: ev.priceChanges.map(describePriceChange).slice(0, 6),
  };
}

export async function generateReport(tx: Tx, ctx: WorkspaceCtx, raw: z.input<typeof reportInput>): Promise<string> {
  const input = reportInput.parse(raw);
  await assertWithinLimit(tx, ctx.orgId, "reportsPerMonth");
  const ent = await getEntitlements(tx, ctx.orgId);
  if (input.type === "competitor_deep_dive" && !input.competitorId) throw new AppError("Choose a competitor for the deep dive.", "invalid");

  const [ws] = await tx<{ name: string; clientName: string | null; brandName: string | null; brandColor: string | null }[]>`
    select name, client_name, brand_name, brand_color from client_workspaces where id = ${ctx.workspaceId}`;
  if (!ws) throw new AppError("Workspace not found", "not_found");
  const end = new Date();
  const start = new Date(end.getTime() - input.periodDays * 86400_000);
  const compFilter = input.competitorId ? tx`and d.competitor_id = ${input.competitorId}` : tx``;

  const competitors = await tx<{ id: string; name: string; websiteUrl: string; description: string | null }[]>`
    select id, name, website_url, description from competitors where workspace_id = ${ctx.workspaceId} and status <> 'archived'
      ${input.competitorId ? tx`and id = ${input.competitorId}` : tx``} order by name`;
  if (input.competitorId && competitors.length === 0) throw new AppError("Competitor not found", "not_found");

  const pages = await tx<{ competitorId: string; url: string; pageType: string; status: string; health: string; successCount: number }[]>`
    select competitor_id, url, page_type, status, health, success_count from monitored_pages
    where workspace_id = ${ctx.workspaceId} and status <> 'removed' and competitor_id in ${tx(competitors.length ? competitors.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"])}`;

  const rows = await tx<{ id: string; competitorName: string; category: string; severity: string; confidence: number; summary: string; sourceUrl: string; detectedAt: Date; previousSnapshotId: string; newSnapshotId: string; needsReview: boolean; evidence: ChangeEvidence; feedback: string | null }[]>`
    select d.id, c.name as competitor_name, d.category, d.severity, d.confidence::float as confidence, d.summary, d.source_url, d.detected_at,
      d.previous_snapshot_id, d.new_snapshot_id, d.needs_review, d.evidence, d.feedback
    from detected_changes d join competitors c on c.id = d.competitor_id
    where d.workspace_id = ${ctx.workspaceId} and d.detected_at >= ${start} and d.detected_at <= ${end}
      and d.review_status <> 'dismissed' and coalesce(d.feedback::text, '') not in ('irrelevant', 'incorrect') ${compFilter}
    order by case d.severity when 'high' then 0 when 'medium' then 1 else 2 end, d.detected_at desc
    limit 200`;

  const changes: ReportChange[] = rows.map((r) => ({
    id: r.id,
    competitor: r.competitorName,
    category: r.category,
    severity: r.severity,
    confidence: r.confidence,
    summary: r.summary,
    sourceUrl: r.sourceUrl,
    detectedAt: r.detectedAt.toISOString(),
    previousSnapshotId: r.previousSnapshotId,
    newSnapshotId: r.newSnapshotId,
    needsReview: r.needsReview,
    evidence: evidenceExcerpt(r.evidence),
  }));

  const insightsRows = await tx<{ id: string; title: string; importance: string; generatedBy: "ai" | "deterministic"; observedFacts: string[]; interpretation: string; suggestedActions: string[]; uncertainty: string; sourceChangeIds: string[]; savedForReport: boolean }[]>`
    select i.id, i.title, i.importance, i.generated_by, i.observed_facts, i.interpretation, i.suggested_actions, i.uncertainty, i.source_change_ids, i.saved_for_report
    from ai_insights i
    where i.workspace_id = ${ctx.workspaceId}
      and (i.saved_for_report or (i.source_change_ids && ${changes.length ? changes.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"]}::uuid[] and i.importance in ('medium', 'high')))
      ${input.competitorId ? tx`and (i.competitor_id = ${input.competitorId} or i.competitor_id is null)` : tx``}
    order by i.saved_for_report desc, case i.importance when 'high' then 0 else 1 end, i.created_at desc limit 12`;
  // Insights must reference changes that are included in this report (or be explicitly saved).
  const includedIds = new Set(changes.map((c) => c.id));
  const insights: ReportInsight[] = insightsRows
    .filter((i) => i.savedForReport || i.sourceChangeIds.some((id) => includedIds.has(id)))
    .map((i) => ({
      id: i.id, title: i.title, importance: i.importance, generatedBy: i.generatedBy, facts: i.observedFacts, interpretation: i.interpretation,
      actions: i.suggestedActions, uncertainty: i.uncertainty, sourceChangeIds: i.sourceChangeIds,
    }));

  const activePages = pages.filter((p) => p.status === "active");
  const coverageNotes: string[] = [];
  const problemPages = activePages.filter((p) => ["failed", "restricted", "delayed"].includes(p.health)).length;
  const noComparison = activePages.filter((p) => p.successCount < 2).length;
  if (problemPages) coverageNotes.push(`${problemPages} monitored page(s) had monitoring problems during the period; changes on those pages may be missing.`);
  if (noComparison) coverageNotes.push(`${noComparison} page(s) do not yet have two snapshots, so no changes can be reported for them.`);
  if (competitors.length && activePages.length === 0) coverageNotes.push("No pages are actively monitored for the selected competitors.");
  coverageNotes.push("Coverage is limited to the pages listed in this report; activity elsewhere is not captured.");

  const high = changes.filter((c) => c.severity === "high");
  const executiveSummary: string[] = [];
  executiveSummary.push(`${changes.length} verified change${changes.length === 1 ? "" : "s"} detected across ${new Set(changes.map((c) => c.competitor)).size} competitor${competitors.length === 1 ? "" : "s"} between ${start.toISOString().slice(0, 10)} and ${end.toISOString().slice(0, 10)}.`);
  if (high.length) executiveSummary.push(`${high.length} high-severity change${high.length === 1 ? "" : "s"}: ${high.slice(0, 3).map((c) => `${c.competitor} — ${c.summary}`).join("; ")}.`);
  const pricing = changes.filter((c) => c.category === "pricing");
  if (pricing.length) executiveSummary.push(`${pricing.length} pricing-related change${pricing.length === 1 ? "" : "s"} recorded.`);
  if (changes.length === 0) executiveSummary.push("No verified changes were detected during this period. This reflects only the monitored pages.");
  const needsReview = changes.filter((c) => c.needsReview).length;
  if (needsReview) executiveSummary.push(`${needsReview} change${needsReview === 1 ? " is" : "s are"} flagged as low-confidence and should be reviewed before acting.`);

  const nextActions = [...new Set(insights.flatMap((i) => i.actions))].slice(0, 6);
  const branding = ent.limits.whiteLabel && ws.brandName
    ? { name: ws.brandName, color: ws.brandColor ?? "#10B981", whiteLabel: true }
    : { name: "RivalTide", color: "#10B981", whiteLabel: false };
  const compName = competitors[0]?.name;
  const title = input.title ?? (input.type === "competitor_deep_dive" && compName ? `${TITLES[input.type]}: ${compName}` : input.type === "client_report" && ws.clientName ? `${TITLES[input.type]} — ${ws.clientName}` : TITLES[input.type]);

  const content: ReportContent = {
    schemaVersion: 1,
    type: input.type,
    title,
    workspace: { name: ws.name, clientName: ws.clientName },
    branding,
    period: { start: start.toISOString(), end: end.toISOString() },
    generatedAt: end.toISOString(),
    isDemo: ctx.isDemo,
    coverage: { competitors: competitors.length, activePages: activePages.length, healthyPages: activePages.filter((p) => p.health === "healthy").length, problemPages, pagesWithoutComparison: noComparison, notes: coverageNotes },
    executiveSummary,
    competitorOverview: competitors.map((c) => ({
      name: c.name,
      website: c.websiteUrl,
      description: c.description,
      pages: pages.filter((p) => p.competitorId === c.id && p.status === "active").map((p) => `${p.pageType}: ${p.url}`),
      changes: changes.filter((x) => x.competitor === c.name).length,
    })),
    majorChanges: changes.filter((c) => c.severity === "high").slice(0, 10),
    pricing,
    product: changes.filter((c) => c.category === "product" || c.category === "features" || c.category === "announcement"),
    positioning: changes.filter((c) => c.category === "positioning"),
    otherChanges: changes.filter((c) => c.category === "general" || c.category === "unclassified").slice(0, 30),
    insights,
    nextActions,
    appendix: changes.map((c) => ({ id: c.id, competitor: c.competitor, sourceUrl: c.sourceUrl, detectedAt: c.detectedAt, previousSnapshotId: c.previousSnapshotId, newSnapshotId: c.newSnapshotId })),
  };
  const json = JSON.stringify(content);
  const hash = createHash("sha256").update(json).digest("hex");
  const [{ version } = { version: 1 }] = await tx<{ version: number }[]>`
    select coalesce(max(version), 0)::int + 1 as version from generated_reports where workspace_id = ${ctx.workspaceId} and type = ${input.type}`;
  const [row] = await tx<{ id: string }[]>`
    insert into generated_reports (organization_id, workspace_id, type, title, period_start, period_end, version, content, content_hash, is_demo, created_by)
    values (${ctx.orgId}, ${ctx.workspaceId}, ${input.type}, ${title}, ${start}, ${end}, ${version}, ${tx.json(content as never)}, ${hash}, ${ctx.isDemo}, ${ctx.userId})
    returning id`;
  // Pin evidence snapshots so retention never deletes material referenced by a report.
  if (changes.length) {
    const snapIds = changes.flatMap((c) => [c.previousSnapshotId, c.newSnapshotId]);
    await tx`update snapshots set pinned = true where id in ${tx(snapIds)}`;
  }
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "report.generate", targetType: "generated_report", targetId: row!.id, metadata: { type: input.type, changes: changes.length } });
  return row!.id;
}

export async function listReports(tx: Tx, ctx: WorkspaceCtx) {
  return tx<{ id: string; type: ReportType; title: string; periodStart: Date; periodEnd: Date; version: number; status: string; createdAt: Date; creator: string | null; contentHash: string }[]>`
    select r.id, r.type, r.title, r.period_start, r.period_end, r.version, r.status, r.created_at, u.name as creator, r.content_hash
    from generated_reports r left join users u on u.id = r.created_by
    where r.workspace_id = ${ctx.workspaceId} order by r.created_at desc limit 100`;
}

export async function getReport(tx: Tx, ctx: WorkspaceCtx, id: string) {
  assertUuid(id, "Report");
  const [row] = await tx<{ id: string; title: string; status: string; version: number; content: ReportContent; contentHash: string; createdAt: Date }[]>`
    select id, title, status, version, content, content_hash, created_at from generated_reports where id = ${id} and workspace_id = ${ctx.workspaceId}`;
  if (!row) throw new AppError("Report not found", "not_found");
  return row;
}

export async function finalizeReport(tx: Tx, ctx: WorkspaceCtx, id: string) {
  assertUuid(id, "Report");
  await tx`update generated_reports set status = 'final' where id = ${id} and workspace_id = ${ctx.workspaceId}`;
}

export async function deleteReport(tx: Tx, ctx: WorkspaceCtx, id: string) {
  assertUuid(id, "Report");
  await tx`delete from generated_reports where id = ${id} and workspace_id = ${ctx.workspaceId} and status = 'draft'`;
}
