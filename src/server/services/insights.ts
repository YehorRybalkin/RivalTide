import { createHash } from "node:crypto";
import { systemDb, type Db } from "../db";
import { recordUsage } from "../audit";
import { env } from "../env";
import { getEntitlements, getUsage } from "../billing/entitlements";
import { deterministicInsight } from "../ai/deterministic";
import { observedFacts, type ChangeForAnalysis } from "../ai/facts";
import { buildUserPrompt, SYSTEM_PROMPT } from "../ai/prompt";
import { AiUnavailableError, estimateCostUsd, getProvider } from "../ai/provider";
import { sanitizeAnalysis, type InsightDraft } from "../ai/schema";

interface ChangeRow extends ChangeForAnalysis {
  organizationId: string;
  workspaceId: string;
  competitorId: string;
  isDemo: boolean;
}

export async function loadChangeForAnalysis(db: Db, changeId: string): Promise<ChangeRow | null> {
  const [row] = await db<ChangeRow[]>`
    select d.id, d.organization_id, d.workspace_id, d.competitor_id, c.name as competitor_name, p.page_type, d.source_url,
      d.category, d.severity, d.confidence::float as confidence, d.summary, d.detected_at, d.evidence, o.is_demo
    from detected_changes d
    join competitors c on c.id = d.competitor_id
    join monitored_pages p on p.id = d.page_id
    join organizations o on o.id = d.organization_id
    where d.id = ${changeId}`;
  return row ?? null;
}

/**
 * Generates an insight for a verified change. AI is used only when
 * configured, within the plan allowance, and for material changes;
 * otherwise (or on any AI failure) a deterministic insight is stored.
 */
export async function generateInsightForChange(changeId: string, opts: { allowAi?: boolean } = {}): Promise<string | null> {
  const db = systemDb();
  const change = await loadChangeForAnalysis(db, changeId);
  if (!change) return null;

  let draft: InsightDraft | null = null;
  let inputHash: string | null = null;
  const provider = opts.allowAi === false || change.isDemo ? null : getProvider();
  const material = change.severity !== "low" && change.category !== "unclassified";

  if (provider && material) {
    const ent = await getEntitlements(db, change.organizationId);
    const usage = await getUsage(db, change.organizationId);
    if (ent.active && usage.aiAnalysesThisMonth < ent.limits.aiAnalysesPerMonth) {
      const user = buildUserPrompt(change, env().AI_MAX_INPUT_CHARS);
      inputHash = createHash("sha256").update(`${provider.name}|${provider.model}|${SYSTEM_PROMPT}|${user}`).digest("hex");
      const [cached] = await db<{ title: string; importance: "low" | "medium" | "high"; interpretation: string; whoAffected: string; opportunities: string[]; threats: string[]; suggestedActions: string[]; uncertainty: string; model: string }[]>`
        select title, importance, interpretation, who_affected, opportunities, threats, suggested_actions, uncertainty, model
        from ai_insights where input_hash = ${inputHash} and organization_id = ${change.organizationId} and generated_by = 'ai' limit 1`;
      if (cached) {
        draft = {
          title: cached.title, importance: cached.importance, interpretation: cached.interpretation, who_affected: cached.whoAffected,
          opportunities: cached.opportunities, threats: cached.threats, suggested_actions: cached.suggestedActions, uncertainty: cached.uncertainty,
          observed_facts: observedFacts(change), generated_by: "ai", provider: provider.name, model: cached.model,
          input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0,
        };
      } else {
        try {
          const r = await provider.analyze(SYSTEM_PROMPT, user);
          const cost = estimateCostUsd(r.model, r.inputTokens, r.outputTokens);
          draft = {
            ...sanitizeAnalysis(r.analysis, [change.sourceUrl]),
            observed_facts: observedFacts(change),
            generated_by: "ai",
            provider: r.provider,
            model: r.model,
            input_tokens: r.inputTokens,
            output_tokens: r.outputTokens,
            estimated_cost_usd: cost,
          };
          await recordUsage(db, change.organizationId, "ai_tokens", r.inputTokens + r.outputTokens, cost, { model: r.model, input: r.inputTokens, output: r.outputTokens, changeId });
        } catch (e) {
          const msg = e instanceof AiUnavailableError ? e.message : (e as Error).message;
          console.warn(`[insights] AI unavailable for change ${changeId}: ${msg}; using deterministic fallback`);
          await recordUsage(db, change.organizationId, "ai_failure", 1, 0, { changeId, error: msg.slice(0, 200) });
          inputHash = null;
        }
      }
    }
  }
  draft ??= deterministicInsight(change);

  await db`delete from ai_insights where change_id = ${changeId} and kind = 'change_analysis' and not saved_for_report`;
  const [row] = await db<{ id: string }[]>`
    insert into ai_insights (organization_id, workspace_id, competitor_id, change_id, kind, generated_by, title, importance,
      observed_facts, interpretation, who_affected, opportunities, threats, suggested_actions, uncertainty, source_change_ids,
      provider, model, input_hash, input_tokens, output_tokens, estimated_cost_usd)
    values (${change.organizationId}, ${change.workspaceId}, ${change.competitorId}, ${changeId}, 'change_analysis', ${draft.generated_by},
      ${draft.title}, ${draft.importance}, ${db.json(draft.observed_facts)}, ${draft.interpretation}, ${draft.who_affected},
      ${db.json(draft.opportunities)}, ${db.json(draft.threats)}, ${db.json(draft.suggested_actions)}, ${draft.uncertainty},
      ${[changeId]}, ${draft.provider}, ${draft.model}, ${inputHash}, ${draft.input_tokens}, ${draft.output_tokens}, ${draft.estimated_cost_usd})
    returning id`;
  return row?.id ?? null;
}

const CATEGORY_LABEL: Record<string, string> = {
  pricing: "pricing", product: "product", features: "feature", positioning: "positioning", announcement: "announcement",
};

/**
 * Emerging themes: only when at least 3 verified material changes from at
 * least 2 different competitors share a category within 30 days. The
 * evidence set is stored with the theme.
 */
export async function detectThemes(workspaceId: string): Promise<number> {
  const db = systemDb();
  const groups = await db<{ organizationId: string; category: string; ids: string[]; competitors: string[]; names: string[] }[]>`
    select d.organization_id, d.category::text as category, array_agg(d.id order by d.detected_at) as ids,
      array_agg(distinct d.competitor_id) as competitors, array_agg(distinct c.name) as names
    from detected_changes d join competitors c on c.id = d.competitor_id
    where d.workspace_id = ${workspaceId} and d.detected_at > now() - interval '30 days'
      and d.review_status <> 'dismissed' and coalesce(d.feedback::text, '') not in ('irrelevant', 'incorrect')
      and d.severity in ('medium', 'high') and d.category::text in ('pricing', 'product', 'features', 'positioning', 'announcement')
    group by d.organization_id, d.category
    having count(*) >= 3 and count(distinct d.competitor_id) >= 2`;
  let created = 0;
  for (const g of groups) {
    const key = `theme:${workspaceId}:${g.category}:${g.ids.slice().sort().join(",")}`;
    const hash = createHash("sha256").update(key).digest("hex");
    const [exists] = await db`select 1 from ai_insights where input_hash = ${hash} and organization_id = ${g.organizationId}`;
    if (exists) continue;
    const label = CATEGORY_LABEL[g.category] ?? g.category;
    await db`insert into ai_insights (organization_id, workspace_id, kind, generated_by, title, importance, observed_facts,
        interpretation, who_affected, suggested_actions, uncertainty, source_change_ids, input_hash)
      values (${g.organizationId}, ${workspaceId}, 'theme', 'deterministic',
        ${`Multiple competitors made ${label} changes in the last 30 days`}, 'medium',
        ${db.json([`${g.ids.length} verified ${label} changes across ${g.competitors.length} competitors: ${g.names.join(", ")}.`])},
        ${`Several monitored competitors changed ${label}-related content in the same period. This may indicate a broader movement in your market, but the sample is small and the changes may be unrelated.`},
        ${"Companies competing in the same segment as these competitors."},
        ${db.json([`Review the ${g.ids.length} supporting changes together to judge whether they share a direction.`])},
        ${"Co-occurrence is not causation; the set covers only the pages you monitor."},
        ${g.ids}, ${hash})`;
    created++;
  }
  return created;
}
