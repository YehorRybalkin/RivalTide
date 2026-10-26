import type { Tx } from "../db";

export interface SearchResult {
  type: "competitor" | "page" | "change" | "insight" | "report";
  id: string;
  title: string;
  subtitle: string;
  workspaceId: string;
  href: string;
}

/**
 * Global search across the user's organizations. Runs under RLS, so results
 * can only include rows from organizations the user belongs to.
 */
export async function globalSearch(tx: Tx, query: string, limitPerType = 6): Promise<SearchResult[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const [competitors, pages, changes, insights, reports] = await Promise.all([
    tx<{ id: string; name: string; websiteUrl: string; workspaceId: string; ws: string }[]>`
      select c.id, c.name, c.website_url, c.workspace_id, w.name as ws from competitors c join client_workspaces w on w.id = c.workspace_id
      where c.status <> 'archived' and (c.name ilike ${like} or c.website_url ilike ${like} or coalesce(c.description, '') ilike ${like})
      order by c.name limit ${limitPerType}`,
    tx<{ id: string; url: string; competitorId: string; name: string; workspaceId: string }[]>`
      select p.id, p.url, p.competitor_id, c.name, p.workspace_id from monitored_pages p join competitors c on c.id = p.competitor_id
      where p.status <> 'removed' and (p.url ilike ${like} or coalesce(p.label, '') ilike ${like}) order by p.url limit ${limitPerType}`,
    tx<{ id: string; summary: string; name: string; category: string; workspaceId: string; detectedAt: Date }[]>`
      select d.id, d.summary, c.name, d.category, d.workspace_id, d.detected_at from detected_changes d join competitors c on c.id = d.competitor_id
      where d.summary ilike ${like} or c.name ilike ${like} order by d.detected_at desc limit ${limitPerType}`,
    tx<{ id: string; title: string; changeId: string | null; workspaceId: string; kind: string }[]>`
      select id, title, change_id, workspace_id, kind from ai_insights where title ilike ${like} or interpretation ilike ${like}
      order by created_at desc limit ${limitPerType}`,
    tx<{ id: string; title: string; workspaceId: string; createdAt: Date }[]>`
      select id, title, workspace_id, created_at from generated_reports where title ilike ${like} order by created_at desc limit ${limitPerType}`,
  ]);
  return [
    ...competitors.map((c) => ({ type: "competitor" as const, id: c.id, title: c.name, subtitle: `${c.websiteUrl} · ${c.ws}`, workspaceId: c.workspaceId, href: `/app/${c.workspaceId}/competitors/${c.id}` })),
    ...pages.map((p) => ({ type: "page" as const, id: p.id, title: p.url, subtitle: p.name, workspaceId: p.workspaceId, href: `/app/${p.workspaceId}/competitors/${p.competitorId}` })),
    ...changes.map((d) => ({ type: "change" as const, id: d.id, title: d.summary, subtitle: `${d.name} · ${d.category} · ${d.detectedAt.toISOString().slice(0, 10)}`, workspaceId: d.workspaceId, href: `/app/${d.workspaceId}/changes/${d.id}` })),
    ...insights.map((i) => ({ type: "insight" as const, id: i.id, title: i.title, subtitle: i.kind === "theme" ? "Emerging theme" : "Insight", workspaceId: i.workspaceId, href: i.changeId ? `/app/${i.workspaceId}/changes/${i.changeId}` : `/app/${i.workspaceId}/insights` })),
    ...reports.map((r) => ({ type: "report" as const, id: r.id, title: r.title, subtitle: r.createdAt.toISOString().slice(0, 10), workspaceId: r.workspaceId, href: `/app/${r.workspaceId}/reports/${r.id}` })),
  ];
}
