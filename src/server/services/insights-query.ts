import { z } from "zod";
import type { Tx } from "../db";
import { audit } from "../audit";
import { assertUuid, type WorkspaceCtx } from "./context";
import { CATEGORIES, type InsightRow } from "./changes";
import { AppError } from "./errors";

export const insightFilters = z.object({
  competitor: z.string().uuid().optional().catch(undefined),
  category: z.enum(CATEGORIES).optional().catch(undefined),
  importance: z.enum(["low", "medium", "high"]).optional().catch(undefined),
  period: z.enum(["7", "30", "90", "365"]).default("30").catch("30"),
  kind: z.enum(["change_analysis", "theme", "saved"]).optional().catch(undefined),
});
export type InsightFilters = z.infer<typeof insightFilters>;

export type InsightListItem = InsightRow & { competitorName: string | null; category: string | null; changeSummary: string | null };

export async function listInsights(tx: Tx, ctx: WorkspaceCtx, f: InsightFilters): Promise<InsightListItem[]> {
  return tx<InsightListItem[]>`
    select ${tx`i.id, i.change_id, i.competitor_id, i.kind, i.generated_by, i.title, i.importance, i.observed_facts,
      i.interpretation, i.who_affected, i.opportunities, i.threats, i.suggested_actions, i.uncertainty, i.source_change_ids, i.model,
      i.saved_for_report, i.created_at`},
      c.name as competitor_name, d.category::text as category, d.summary as change_summary
    from ai_insights i
    left join competitors c on c.id = i.competitor_id
    left join detected_changes d on d.id = i.change_id
    where i.workspace_id = ${ctx.workspaceId}
      and i.created_at > now() - make_interval(days => ${Number(f.period)})
      and (d.id is null or d.review_status <> 'dismissed')
      ${f.competitor ? tx`and i.competitor_id = ${f.competitor}` : tx``}
      ${f.category ? tx`and d.category = ${f.category}` : tx``}
      ${f.importance ? tx`and i.importance = ${f.importance}` : tx``}
      ${f.kind === "saved" ? tx`and i.saved_for_report` : f.kind ? tx`and i.kind = ${f.kind}` : tx``}
    order by case i.importance when 'high' then 0 when 'medium' then 1 else 2 end, i.created_at desc
    limit 100`;
}

export async function getThemeEvidence(tx: Tx, ctx: WorkspaceCtx, ids: string[]) {
  if (ids.length === 0) return [];
  return tx<{ id: string; competitorName: string; summary: string; detectedAt: Date; category: string }[]>`
    select d.id, c.name as competitor_name, d.summary, d.detected_at, d.category from detected_changes d
    join competitors c on c.id = d.competitor_id where d.workspace_id = ${ctx.workspaceId} and d.id in ${tx(ids)} order by d.detected_at desc`;
}

export async function toggleSaveInsight(tx: Tx, ctx: WorkspaceCtx, insightId: string, saved: boolean) {
  assertUuid(insightId, "Insight");
  const res = await tx`update ai_insights set saved_for_report = ${saved} where id = ${insightId} and workspace_id = ${ctx.workspaceId} returning id`;
  if (!res.length) throw new AppError("Insight not found", "not_found");
}

/**
 * Authorizes a user-triggered (re)analysis under RLS. The caller runs
 * generateInsightForChange() after this transaction commits.
 */
export async function authorizeRegenerate(tx: Tx, ctx: WorkspaceCtx, changeId: string) {
  assertUuid(changeId, "Change");
  if (ctx.isDemo) throw new AppError("The demo workspace is read-only.", "forbidden");
  const [own] = await tx`select id from detected_changes where id = ${changeId} and workspace_id = ${ctx.workspaceId}`;
  if (!own) throw new AppError("Change not found", "not_found");
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "insight.regenerate", targetType: "detected_change", targetId: changeId });
}
