import { z } from "zod";
import type { Tx } from "../db";
import { audit } from "../audit";
import { assertWithinLimit, getEntitlements, requireFeature } from "../billing/entitlements";
import { normalizeUserUrl, sameSite, UnsafeUrlError } from "../monitoring/url-safety";
import { assertUuid, type WorkspaceCtx } from "./context";
import { AppError } from "./errors";
import { guessPageType } from "./discovery";

export const PAGE_TYPES = ["homepage", "pricing", "features", "product", "blog", "changelog", "announcements", "other"] as const;

const urlField = z.string().trim().min(1, "Website URL is required").max(2048).transform((v, ctx) => {
  try {
    return normalizeUserUrl(v);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: e instanceof UnsafeUrlError ? e.message : "Invalid URL" });
    return z.NEVER;
  }
});

export const competitorInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  websiteUrl: urlField,
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  category: z.string().trim().max(80).optional().transform((v) => v || null),
  industry: z.string().trim().max(80).optional().transform((v) => v || null),
  notes: z.string().trim().max(5000).optional().transform((v) => v || null),
});
export type CompetitorInput = z.input<typeof competitorInput>;

export const pageInput = z.object({
  url: urlField,
  pageType: z.enum(PAGE_TYPES).optional(),
  label: z.string().trim().max(120).optional().transform((v) => v || null),
  renderMode: z.enum(["static", "browser"]).default("static"),
});
export type PageInput = z.input<typeof pageInput>;

function assertWritable(ctx: WorkspaceCtx) {
  if (ctx.isDemo) throw new AppError("The demo workspace is read-only. Create a free account to monitor real competitors.", "forbidden");
}

export async function createCompetitor(tx: Tx, ctx: WorkspaceCtx, raw: CompetitorInput): Promise<string> {
  assertWritable(ctx);
  const input = competitorInput.parse(raw);
  await assertWithinLimit(tx, ctx.orgId, "competitors");
  const [row] = await tx<{ id: string }[]>`
    insert into competitors (organization_id, workspace_id, name, website_url, description, category, industry, notes, created_by)
    values (${ctx.orgId}, ${ctx.workspaceId}, ${input.name}, ${input.websiteUrl}, ${input.description}, ${input.category},
      ${input.industry}, ${input.notes}, ${ctx.userId})
    returning id`;
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "competitor.create", targetType: "competitor", targetId: row!.id });
  return row!.id;
}

export async function updateCompetitor(tx: Tx, ctx: WorkspaceCtx, competitorId: string, raw: CompetitorInput): Promise<void> {
  assertWritable(ctx);
  assertUuid(competitorId, "Competitor");
  const input = competitorInput.parse(raw);
  const res = await tx`update competitors set name = ${input.name}, website_url = ${input.websiteUrl}, description = ${input.description},
      category = ${input.category}, industry = ${input.industry}, notes = ${input.notes}
    where id = ${competitorId} and workspace_id = ${ctx.workspaceId} returning id`;
  if (res.length === 0) throw new AppError("Competitor not found", "not_found");
}

export async function setCompetitorStatus(tx: Tx, ctx: WorkspaceCtx, competitorId: string, status: "active" | "paused" | "archived"): Promise<void> {
  assertWritable(ctx);
  assertUuid(competitorId, "Competitor");
  if (status === "active") {
    const [c] = await tx<{ status: string }[]>`select status from competitors where id = ${competitorId} and workspace_id = ${ctx.workspaceId}`;
    if (c?.status === "archived") await assertWithinLimit(tx, ctx.orgId, "competitors");
  }
  const res = await tx`update competitors set status = ${status} where id = ${competitorId} and workspace_id = ${ctx.workspaceId} returning id`;
  if (res.length === 0) throw new AppError("Competitor not found", "not_found");
  const health = status === "active" ? null : "paused";
  if (health) {
    await tx`update monitored_pages set health = 'paused' where competitor_id = ${competitorId} and status = 'active'`;
    await tx`update monitoring_jobs set status = 'cancelled', last_error = 'Competitor paused', finished_at = now()
      where page_id in (select id from monitored_pages where competitor_id = ${competitorId}) and status = 'queued'`;
  } else {
    await tx`update monitored_pages set health = case when last_success_at is null then 'pending'::page_health else 'healthy'::page_health end,
      next_check_at = least(next_check_at, now()) where competitor_id = ${competitorId} and status = 'active'`;
  }
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: `competitor.${status}`, targetType: "competitor", targetId: competitorId });
}

export async function addPages(tx: Tx, ctx: WorkspaceCtx, competitorId: string, rawPages: PageInput[]): Promise<string[]> {
  assertWritable(ctx);
  assertUuid(competitorId, "Competitor");
  const pages = rawPages.map((p) => pageInput.parse(p));
  if (pages.length === 0) return [];
  const [comp] = await tx<{ websiteUrl: string; status: string }[]>`select website_url, status from competitors where id = ${competitorId} and workspace_id = ${ctx.workspaceId}`;
  if (!comp) throw new AppError("Competitor not found", "not_found");
  if (comp.status === "archived") throw new AppError("Restore this competitor before adding pages.", "invalid");
  for (const p of pages) {
    if (!sameSite(p.url, comp.websiteUrl)) {
      throw new AppError(`${p.url} is not on the competitor's website (${new URL(comp.websiteUrl).hostname}).`, "invalid");
    }
  }
  const [{ existing } = { existing: 0 }] = await tx<{ existing: number }[]>`
    select count(*)::int as existing from monitored_pages where competitor_id = ${competitorId} and status <> 'removed'
      and url in ${tx(pages.map((p) => p.url))}`;
  const ent = await assertWithinLimit(tx, ctx.orgId, "pages", pages.length - existing);
  if (pages.some((p) => p.renderMode === "browser")) requireFeature(ent, "browserRendering");
  const [ws] = await tx<{ interval: number }[]>`select default_check_interval_hours as interval from client_workspaces where id = ${ctx.workspaceId}`;
  const interval = Math.max(ws?.interval ?? 24, ent.limits.minCheckIntervalHours);
  const ids: string[] = [];
  for (const p of pages) {
    const [row] = await tx<{ id: string }[]>`
      insert into monitored_pages (organization_id, workspace_id, competitor_id, url, page_type, label, render_mode, check_interval_hours)
      values (${ctx.orgId}, ${ctx.workspaceId}, ${competitorId}, ${p.url}, ${p.pageType ?? guessPageType(p.url)}, ${p.label}, ${p.renderMode}, ${interval})
      on conflict (competitor_id, url) where status <> 'removed' do nothing
      returning id`;
    if (row) ids.push(row.id);
  }
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "pages.add", targetType: "competitor", targetId: competitorId, metadata: { count: ids.length } });
  return ids;
}

export async function setPageStatus(tx: Tx, ctx: WorkspaceCtx, pageId: string, status: "active" | "paused" | "removed"): Promise<void> {
  assertWritable(ctx);
  assertUuid(pageId, "Page");
  if (status === "active") {
    const [p] = await tx<{ status: string }[]>`select status from monitored_pages where id = ${pageId} and workspace_id = ${ctx.workspaceId}`;
    if (p?.status === "removed") throw new AppError("Removed pages cannot be resumed; add the page again.", "invalid");
  }
  const health = status === "active" ? tx`case when last_success_at is null then 'pending'::page_health else 'healthy'::page_health end` : tx`'paused'::page_health`;
  const res = await tx`update monitored_pages set status = ${status}, health = ${health},
      next_check_at = case when ${status} = 'active' then least(next_check_at, now()) else next_check_at end
    where id = ${pageId} and workspace_id = ${ctx.workspaceId} returning id`;
  if (res.length === 0) throw new AppError("Page not found", "not_found");
  if (status !== "active") {
    await tx`update monitoring_jobs set status = 'cancelled', last_error = 'Page paused or removed', finished_at = now() where page_id = ${pageId} and status = 'queued'`;
  }
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: `page.${status}`, targetType: "monitored_page", targetId: pageId });
}

export interface CompetitorListItem {
  id: string;
  name: string;
  websiteUrl: string;
  description: string | null;
  category: string | null;
  industry: string | null;
  status: "active" | "paused" | "archived";
  pageCount: number;
  healthyPages: number;
  problemPages: number;
  changes30d: number;
  lastChangeAt: Date | null;
  lastSuccessAt: Date | null;
}

export async function listCompetitors(tx: Tx, ctx: WorkspaceCtx, opts: { includeArchived?: boolean } = {}): Promise<CompetitorListItem[]> {
  return tx<CompetitorListItem[]>`
    select c.id, c.name, c.website_url, c.description, c.category, c.industry, c.status,
      (select count(*)::int from monitored_pages p where p.competitor_id = c.id and p.status <> 'removed') as page_count,
      (select count(*)::int from monitored_pages p where p.competitor_id = c.id and p.status = 'active' and p.health = 'healthy') as healthy_pages,
      (select count(*)::int from monitored_pages p where p.competitor_id = c.id and p.status = 'active' and p.health in ('failed', 'restricted', 'delayed')) as problem_pages,
      (select count(*)::int from detected_changes d where d.competitor_id = c.id and d.detected_at > now() - interval '30 days' and d.review_status <> 'dismissed') as changes_30d,
      (select max(detected_at) from detected_changes d where d.competitor_id = c.id) as last_change_at,
      (select max(last_success_at) from monitored_pages p where p.competitor_id = c.id) as last_success_at
    from competitors c
    where c.workspace_id = ${ctx.workspaceId} ${opts.includeArchived ? tx`` : tx`and c.status <> 'archived'`}
    order by c.status = 'archived', c.name`;
}

export interface PageRow {
  id: string;
  url: string;
  pageType: string;
  label: string | null;
  renderMode: "static" | "browser";
  status: "active" | "paused" | "removed";
  health: string;
  healthDetail: string | null;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  nextCheckAt: Date;
  snapshotCount: number;
  successCount: number;
  checkIntervalHours: number;
  activeJob: string | null;
}

export async function getCompetitorProfile(tx: Tx, ctx: WorkspaceCtx, competitorId: string) {
  assertUuid(competitorId, "Competitor");
  const [competitor] = await tx<(Omit<CompetitorListItem, "pageCount" | "healthyPages" | "problemPages" | "changes30d" | "lastChangeAt" | "lastSuccessAt"> & { notes: string | null; createdAt: Date })[]>`
    select id, name, website_url, description, category, industry, notes, status, created_at
    from competitors where id = ${competitorId} and workspace_id = ${ctx.workspaceId}`;
  if (!competitor) throw new AppError("Competitor not found", "not_found");
  const pages = await tx<PageRow[]>`
    select p.id, p.url, p.page_type, p.label, p.render_mode, p.status, p.health, p.health_detail, p.last_attempt_at, p.last_success_at,
      p.next_check_at, p.snapshot_count, p.success_count, p.check_interval_hours,
      (select j.status::text from monitoring_jobs j where j.page_id = p.id and j.status in ('queued', 'running') limit 1) as active_job
    from monitored_pages p where p.competitor_id = ${competitorId} and p.status <> 'removed' order by p.page_type, p.url`;
  const changes = await tx<{ id: string; category: string; severity: string; summary: string; detectedAt: Date; pageType: string; confidence: number; reviewStatus: string; needsReview: boolean }[]>`
    select d.id, d.category, d.severity, d.summary, d.detected_at, p.page_type, d.confidence::float as confidence, d.review_status, d.needs_review
    from detected_changes d join monitored_pages p on p.id = d.page_id
    where d.competitor_id = ${competitorId} order by d.detected_at desc limit 25`;
  const frequency = await tx<{ week: Date; count: number }[]>`
    select date_trunc('week', detected_at) as week, count(*)::int as count from detected_changes
    where competitor_id = ${competitorId} and detected_at > now() - interval '12 weeks' group by 1 order by 1`;
  const insights = await tx<{ id: string; title: string; importance: string; generatedBy: string; createdAt: Date }[]>`
    select id, title, importance, generated_by, created_at from ai_insights where competitor_id = ${competitorId}
    order by created_at desc limit 5`;
  // Price history: price points from successive snapshots of pricing pages (high/medium confidence only).
  const priceSnaps = await tx<{ createdAt: Date; prices: { amount: number; currency: string; plan: string | null; period: string; confidence: string; struck: boolean; promotional: boolean; billedAnnually: boolean }[]; url: string }[]>`
    select s.created_at, s.content->'prices' as prices, p.url
    from snapshots s join monitored_pages p on p.id = s.page_id
    where p.competitor_id = ${competitorId} and p.page_type = 'pricing'
    order by s.created_at asc limit 60`;
  const priceHistory: { date: string; series: string; amount: number; currency: string }[] = [];
  for (const s of priceSnaps) {
    for (const p of s.prices ?? []) {
      if (p.struck || p.promotional || p.confidence === "low" || p.period === "unknown" || !p.plan) continue;
      priceHistory.push({ date: s.createdAt.toISOString(), series: `${p.plan} (${p.period === "month" ? "monthly" : p.period === "year" ? "annual" : "one-time"}${p.billedAnnually ? ", billed annually" : ""})`, amount: p.amount, currency: p.currency });
    }
  }
  return { competitor, pages, changes, frequency, insights, priceHistory };
}

export async function getEntitlementsForCtx(tx: Tx, ctx: WorkspaceCtx) {
  return getEntitlements(tx, ctx.orgId);
}
