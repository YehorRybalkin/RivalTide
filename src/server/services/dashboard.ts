import type { Tx } from "../db";
import type { WorkspaceCtx } from "./context";
import { insightColumns, type ChangeListItem, type InsightRow } from "./changes";

export interface DashboardData {
  stats: {
    competitors: number;
    activePages: number;
    importantThisWeek: number;
    pricingChanges30d: number;
    productChanges30d: number;
    needsReview: number;
    unread: number;
  };
  health: Record<"healthy" | "delayed" | "failed" | "paused" | "restricted" | "pending", number>;
  timeline: ChangeListItem[];
  highlights: InsightRow[];
  byCategory: { category: string; count: number }[];
  weekly: { week: string; pricing: number; product: number; features: number; positioning: number; announcement: number; general: number }[];
  competitors: { id: string; name: string; websiteUrl: string; status: string; changes30d: number; lastChangeAt: Date | null; pages: number; problemPages: number }[];
  lastCheckAt: Date | null;
  firstBaselinePending: number;
}

export async function getDashboard(tx: Tx, ctx: WorkspaceCtx): Promise<DashboardData> {
  const ws = ctx.workspaceId;
  const [stats] = await tx<DashboardData["stats"][]>`
    select
      (select count(*)::int from competitors where workspace_id = ${ws} and status <> 'archived') as competitors,
      (select count(*)::int from monitored_pages p join competitors c on c.id = p.competitor_id
        where p.workspace_id = ${ws} and p.status = 'active' and c.status = 'active') as active_pages,
      (select count(*)::int from detected_changes where workspace_id = ${ws} and detected_at > now() - interval '7 days'
        and severity in ('medium', 'high') and review_status <> 'dismissed') as important_this_week,
      (select count(*)::int from detected_changes where workspace_id = ${ws} and detected_at > now() - interval '30 days'
        and category = 'pricing' and review_status <> 'dismissed') as pricing_changes_30d,
      (select count(*)::int from detected_changes where workspace_id = ${ws} and detected_at > now() - interval '30 days'
        and category in ('product', 'features') and review_status <> 'dismissed') as product_changes_30d,
      (select count(*)::int from detected_changes where workspace_id = ${ws} and needs_review and review_status = 'new') as needs_review,
      (select count(*)::int from detected_changes where workspace_id = ${ws} and not is_read and review_status <> 'dismissed') as unread`;

  const healthRows = await tx<{ health: string; count: number }[]>`
    select case when p.status = 'paused' or c.status = 'paused' then 'paused' else p.health::text end as health, count(*)::int as count
    from monitored_pages p join competitors c on c.id = p.competitor_id
    where p.workspace_id = ${ws} and p.status <> 'removed' and c.status <> 'archived' group by 1`;
  const health = { healthy: 0, delayed: 0, failed: 0, paused: 0, restricted: 0, pending: 0 };
  for (const r of healthRows) health[r.health as keyof typeof health] = r.count;

  const timeline = await tx<ChangeListItem[]>`
    select d.id, d.competitor_id, c.name as competitor_name, d.page_id, p.page_type, d.source_url, d.category, d.severity,
      d.confidence::float as confidence, d.summary, d.needs_review, d.review_status, d.feedback, d.is_read, d.detected_at
    from detected_changes d join competitors c on c.id = d.competitor_id join monitored_pages p on p.id = d.page_id
    where d.workspace_id = ${ws} and d.review_status <> 'dismissed'
    order by d.detected_at desc limit 12`;

  const highlights = await tx<InsightRow[]>`
    select ${insightColumns(tx)} from ai_insights
    where workspace_id = ${ws} and importance in ('high', 'medium') and created_at > now() - interval '30 days'
      and (change_id is null or change_id in (select id from detected_changes where review_status <> 'dismissed'))
    order by case importance when 'high' then 0 else 1 end, created_at desc limit 4`;

  const byCategory = await tx<{ category: string; count: number }[]>`
    select category::text, count(*)::int as count from detected_changes
    where workspace_id = ${ws} and detected_at > now() - interval '30 days' and review_status <> 'dismissed'
    group by 1 order by 2 desc`;

  const weeklyRows = await tx<{ week: Date; category: string; count: number }[]>`
    select date_trunc('week', detected_at) as week, category::text, count(*)::int as count from detected_changes
    where workspace_id = ${ws} and detected_at > now() - interval '8 weeks' and review_status <> 'dismissed'
    group by 1, 2 order by 1`;
  const weeks = new Map<string, DashboardData["weekly"][number]>();
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - i * 7);
    const key = d.toISOString().slice(0, 10);
    weeks.set(key, { week: key, pricing: 0, product: 0, features: 0, positioning: 0, announcement: 0, general: 0 });
  }
  for (const r of weeklyRows) {
    const key = r.week.toISOString().slice(0, 10);
    const w = weeks.get(key);
    if (!w) continue;
    const cat = (r.category === "unclassified" ? "general" : r.category) as keyof Omit<typeof w, "week">;
    w[cat] += r.count;
  }

  const competitors = await tx<DashboardData["competitors"]>`
    select c.id, c.name, c.website_url, c.status,
      (select count(*)::int from detected_changes d where d.competitor_id = c.id and d.detected_at > now() - interval '30 days' and d.review_status <> 'dismissed') as changes_30d,
      (select max(detected_at) from detected_changes d where d.competitor_id = c.id) as last_change_at,
      (select count(*)::int from monitored_pages p where p.competitor_id = c.id and p.status <> 'removed') as pages,
      (select count(*)::int from monitored_pages p where p.competitor_id = c.id and p.status = 'active' and p.health in ('failed', 'restricted')) as problem_pages
    from competitors c where c.workspace_id = ${ws} and c.status <> 'archived' order by changes_30d desc, c.name limit 12`;

  const [meta] = await tx<{ lastCheckAt: Date | null; firstBaselinePending: number }[]>`
    select max(last_attempt_at) as last_check_at,
      count(*) filter (where snapshot_count < 2 and status = 'active')::int as first_baseline_pending
    from monitored_pages where workspace_id = ${ws} and status <> 'removed'`;

  return {
    stats: stats!,
    health,
    timeline,
    highlights,
    byCategory,
    weekly: [...weeks.values()],
    competitors,
    lastCheckAt: meta?.lastCheckAt ?? null,
    firstBaselinePending: meta?.firstBaselinePending ?? 0,
  };
}

/** Organization-wide overview for agencies (all client workspaces the user can access). */
export async function getAgencyOverview(tx: Tx, orgId: string) {
  return tx<{ id: string; name: string; clientName: string | null; competitors: number; pages: number; changes7d: number; highChanges7d: number; problemPages: number; draftReports: number; lastChangeAt: Date | null }[]>`
    select w.id, w.name, w.client_name,
      (select count(*)::int from competitors c where c.workspace_id = w.id and c.status <> 'archived') as competitors,
      (select count(*)::int from monitored_pages p where p.workspace_id = w.id and p.status = 'active') as pages,
      (select count(*)::int from detected_changes d where d.workspace_id = w.id and d.detected_at > now() - interval '7 days' and d.review_status <> 'dismissed') as changes_7d,
      (select count(*)::int from detected_changes d where d.workspace_id = w.id and d.detected_at > now() - interval '7 days' and d.severity = 'high' and d.review_status <> 'dismissed') as high_changes_7d,
      (select count(*)::int from monitored_pages p where p.workspace_id = w.id and p.status = 'active' and p.health in ('failed', 'restricted', 'delayed')) as problem_pages,
      (select count(*)::int from generated_reports r where r.workspace_id = w.id and r.status = 'draft') as draft_reports,
      (select max(detected_at) from detected_changes d where d.workspace_id = w.id) as last_change_at
    from client_workspaces w where w.organization_id = ${orgId} and w.archived_at is null order by w.name`;
}
