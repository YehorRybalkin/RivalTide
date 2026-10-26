import { z } from "zod";
import type { Tx } from "../db";
import { audit } from "../audit";
import { patternHash, type ChangeEvidence } from "../detection/diff";
import { maskVolatile } from "../detection/extract";
import { assertUuid, type WorkspaceCtx } from "./context";
import { AppError } from "./errors";

export const CATEGORIES = ["pricing", "product", "features", "positioning", "announcement", "general", "unclassified"] as const;
export const SEVERITIES = ["low", "medium", "high"] as const;

export const changeFilters = z.object({
  competitor: z.string().uuid().optional().catch(undefined),
  category: z.enum(CATEGORIES).optional().catch(undefined),
  severity: z.enum(SEVERITIES).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  read: z.enum(["read", "unread"]).optional().catch(undefined),
  review: z.enum(["reviewed", "unreviewed", "dismissed", "needs_review"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type ChangeFilters = z.infer<typeof changeFilters>;

export interface ChangeListItem {
  id: string;
  competitorId: string;
  competitorName: string;
  pageId: string;
  pageType: string;
  sourceUrl: string;
  category: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  summary: string;
  needsReview: boolean;
  reviewStatus: "new" | "reviewed" | "dismissed";
  feedback: string | null;
  isRead: boolean;
  detectedAt: Date;
}

export const PAGE_SIZE = 25;

export async function listChanges(tx: Tx, ctx: WorkspaceCtx, f: ChangeFilters, pageSize = PAGE_SIZE): Promise<{ items: ChangeListItem[]; total: number }> {
  const where = tx`
    d.workspace_id = ${ctx.workspaceId}
    ${f.competitor ? tx`and d.competitor_id = ${f.competitor}` : tx``}
    ${f.category ? tx`and d.category = ${f.category}` : tx``}
    ${f.severity ? tx`and d.severity = ${f.severity}` : tx``}
    ${f.from ? tx`and d.detected_at >= ${f.from}::date` : tx``}
    ${f.to ? tx`and d.detected_at < ${f.to}::date + 1` : tx``}
    ${f.read === "read" ? tx`and d.is_read` : f.read === "unread" ? tx`and not d.is_read` : tx``}
    ${f.review === "reviewed" ? tx`and d.review_status = 'reviewed'`
      : f.review === "unreviewed" ? tx`and d.review_status = 'new'`
      : f.review === "dismissed" ? tx`and d.review_status = 'dismissed'`
      : f.review === "needs_review" ? tx`and d.needs_review and d.review_status = 'new'`
      : tx`and d.review_status <> 'dismissed'`}`;
  const items = await tx<ChangeListItem[]>`
    select d.id, d.competitor_id, c.name as competitor_name, d.page_id, p.page_type, d.source_url, d.category, d.severity,
      d.confidence::float as confidence, d.summary, d.needs_review, d.review_status, d.feedback, d.is_read, d.detected_at
    from detected_changes d join competitors c on c.id = d.competitor_id join monitored_pages p on p.id = d.page_id
    where ${where}
    order by d.detected_at desc, d.id
    limit ${pageSize} offset ${(f.page - 1) * pageSize}`;
  const [{ total } = { total: 0 }] = await tx<{ total: number }[]>`select count(*)::int as total from detected_changes d where ${where}`;
  return { items, total };
}

export interface ChangeDetail extends ChangeListItem {
  evidence: ChangeEvidence;
  detectionMethod: string;
  previousSnapshotId: string;
  newSnapshotId: string;
  previousFetchedAt: Date;
  newFetchedAt: Date;
  previousHash: string;
  newHash: string;
  pageUrl: string;
  pageHealth: string;
  pageLastSuccessAt: Date | null;
  competitorWebsite: string;
}

export async function getChange(tx: Tx, ctx: WorkspaceCtx, changeId: string): Promise<ChangeDetail> {
  assertUuid(changeId, "Change");
  const [row] = await tx<ChangeDetail[]>`
    select d.id, d.competitor_id, c.name as competitor_name, c.website_url as competitor_website, d.page_id, p.page_type, p.url as page_url,
      p.health as page_health, p.last_success_at as page_last_success_at, d.source_url, d.category, d.severity,
      d.confidence::float as confidence, d.summary, d.needs_review, d.review_status, d.feedback, d.is_read, d.detected_at,
      d.evidence, d.detection_method, d.previous_snapshot_id, d.new_snapshot_id,
      ps.created_at as previous_fetched_at, ns.created_at as new_fetched_at, ps.content_hash as previous_hash, ns.content_hash as new_hash
    from detected_changes d
    join competitors c on c.id = d.competitor_id
    join monitored_pages p on p.id = d.page_id
    join snapshots ps on ps.id = d.previous_snapshot_id
    join snapshots ns on ns.id = d.new_snapshot_id
    where d.id = ${changeId} and d.workspace_id = ${ctx.workspaceId}`;
  if (!row) throw new AppError("Change not found", "not_found");
  if (!row.isRead) await tx`update detected_changes set is_read = true where id = ${changeId}`;
  return row;
}

export async function getInsightForChange(tx: Tx, ctx: WorkspaceCtx, changeId: string) {
  const [row] = await tx<InsightRow[]>`
    select ${insightColumns(tx)} from ai_insights where change_id = ${changeId} and workspace_id = ${ctx.workspaceId}
    order by created_at desc limit 1`;
  return row ?? null;
}

export interface InsightRow {
  id: string;
  changeId: string | null;
  competitorId: string | null;
  kind: "change_analysis" | "theme";
  generatedBy: "ai" | "deterministic";
  title: string;
  importance: "low" | "medium" | "high";
  observedFacts: string[];
  interpretation: string;
  whoAffected: string;
  opportunities: string[];
  threats: string[];
  suggestedActions: string[];
  uncertainty: string;
  sourceChangeIds: string[];
  model: string | null;
  savedForReport: boolean;
  createdAt: Date;
}

export function insightColumns(tx: Tx) {
  return tx`id, change_id, competitor_id, kind, generated_by, title, importance, observed_facts, interpretation, who_affected,
    opportunities, threats, suggested_actions, uncertainty, source_change_ids, model, saved_for_report, created_at`;
}

export async function setReviewStatus(tx: Tx, ctx: WorkspaceCtx, changeId: string, status: "new" | "reviewed" | "dismissed"): Promise<void> {
  assertUuid(changeId, "Change");
  const res = await tx`update detected_changes set review_status = ${status}, is_read = true where id = ${changeId} and workspace_id = ${ctx.workspaceId} returning id`;
  if (!res.length) throw new AppError("Change not found", "not_found");
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: `change.${status}`, targetType: "detected_change", targetId: changeId });
}

export async function markAllRead(tx: Tx, ctx: WorkspaceCtx): Promise<void> {
  await tx`update detected_changes set is_read = true where workspace_id = ${ctx.workspaceId} and not is_read`;
}

/**
 * Records user feedback. "Irrelevant"/"incorrect" feedback adds suppression
 * patterns for the changed blocks, so the same content does not produce
 * future changes for this page.
 */
export async function giveFeedback(tx: Tx, ctx: WorkspaceCtx, changeId: string, feedback: "relevant" | "irrelevant" | "incorrect"): Promise<void> {
  assertUuid(changeId, "Change");
  const [row] = await tx<{ pageId: string; evidence: ChangeEvidence }[]>`
    update detected_changes set feedback = ${feedback}, feedback_by = ${ctx.userId}, is_read = true,
      review_status = case when ${feedback} = 'relevant' then 'reviewed'::change_review_status else 'dismissed'::change_review_status end
    where id = ${changeId} and workspace_id = ${ctx.workspaceId} returning page_id, evidence`;
  if (!row) throw new AppError("Change not found", "not_found");
  if (feedback !== "relevant") {
    const texts = [
      ...row.evidence.added.map((b) => b.t),
      ...row.evidence.removed.map((b) => b.t),
      ...row.evidence.modified.flatMap((m) => [m.before, m.after]),
    ].filter((t) => t.length > 0).slice(0, 100);
    for (const t of texts) {
      const masked = maskVolatile(t);
      await tx`insert into change_suppressions (organization_id, page_id, pattern_hash, sample_text, created_by)
        values (${ctx.orgId}, ${row.pageId}, ${patternHash(masked)}, ${t.slice(0, 300)}, ${ctx.userId})
        on conflict (page_id, pattern_hash) do nothing`;
    }
  } else {
    await tx`delete from change_suppressions where page_id = ${row.pageId} and pattern_hash in ${tx(
      [...row.evidence.added.map((b) => b.t), ...row.evidence.modified.map((m) => m.after)].map((t) => patternHash(maskVolatile(t))).concat(["-"]),
    )}`;
  }
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "change.feedback", targetType: "detected_change", targetId: changeId, metadata: { feedback } });
}

export async function getSnapshot(tx: Tx, ctx: WorkspaceCtx, snapshotId: string) {
  assertUuid(snapshotId, "Snapshot");
  const [row] = await tx<{ id: string; pageId: string; contentHash: string; content: { title: string; description: string; blocks: { k: string; t: string; r: string }[] }; finalUrl: string; httpStatus: number | null; createdAt: Date; url: string; competitorName: string }[]>`
    select s.id, s.page_id, s.content_hash, s.content, s.final_url, s.http_status, s.created_at, p.url, c.name as competitor_name
    from snapshots s join monitored_pages p on p.id = s.page_id join competitors c on c.id = p.competitor_id
    where s.id = ${snapshotId} and p.workspace_id = ${ctx.workspaceId}`;
  if (!row) throw new AppError("Snapshot not found", "not_found");
  return row;
}
