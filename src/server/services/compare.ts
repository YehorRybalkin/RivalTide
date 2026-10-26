import { z } from "zod";
import type { Tx } from "../db";
import type { NormalizedContent } from "../detection/extract";
import { formatMoney, type PricePoint } from "../detection/pricing";
import { assertUuid, type WorkspaceCtx } from "./context";
import { AppError } from "./errors";

export interface Cell {
  value: string | null; // null => "Not available"
  items?: string[];
  source?: "observed" | "competitor_claim" | "validated" | "user_note" | "derived";
  evidenceUrl?: string | null;
  snapshotId?: string | null;
  asOf?: Date | null;
}

export interface ComparisonRow {
  key: string;
  label: string;
  hint?: string;
  criterionId?: string;
  cells: Record<string, Cell>;
}

export interface Comparison {
  competitors: { id: string; name: string; websiteUrl: string }[];
  rows: ComparisonRow[];
}

const NA: Cell = { value: null };

function periodLabel(p: PricePoint): string {
  const base = p.period === "month" ? "/mo" : p.period === "year" ? "/yr" : p.period === "one_time" ? " one-time" : "";
  return `${base}${p.billedAnnually ? " (billed annually)" : ""}${p.perSeat ? " per seat" : ""}`;
}

export async function buildComparison(tx: Tx, ctx: WorkspaceCtx, competitorIds: string[]): Promise<Comparison> {
  const ids = [...new Set(competitorIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 5);
  if (ids.length < 2) throw new AppError("Select between 2 and 5 competitors to compare.", "invalid");
  const competitors = await tx<{ id: string; name: string; websiteUrl: string }[]>`
    select id, name, website_url from competitors where workspace_id = ${ctx.workspaceId} and id in ${tx(ids)} order by name`;
  if (competitors.length < 2) throw new AppError("Select between 2 and 5 competitors to compare.", "invalid");

  // Latest successful snapshot per page type for each competitor.
  const latest = await tx<{ competitorId: string; pageType: string; url: string; snapshotId: string; createdAt: Date; content: NormalizedContent }[]>`
    select distinct on (p.competitor_id, p.page_type) p.competitor_id, p.page_type, p.url, s.id as snapshot_id, s.created_at, s.content
    from monitored_pages p join snapshots s on s.id = p.last_snapshot_id
    where p.competitor_id in ${tx(competitors.map((c) => c.id))} and p.status <> 'removed'
    order by p.competitor_id, p.page_type, s.created_at desc`;
  const activity = await tx<{ competitorId: string; total: number; pricing: number; product: number; announcements: number }[]>`
    select competitor_id, count(*)::int as total,
      count(*) filter (where category = 'pricing')::int as pricing,
      count(*) filter (where category in ('product', 'features'))::int as product,
      count(*) filter (where category = 'announcement')::int as announcements
    from detected_changes where competitor_id in ${tx(competitors.map((c) => c.id))} and detected_at > now() - interval '90 days'
      and review_status <> 'dismissed'
    group by competitor_id`;
  const announcements = await tx<{ competitorId: string; id: string; summary: string; detectedAt: Date }[]>`
    select competitor_id, id, summary, detected_at from (
      select competitor_id, id, summary, detected_at, row_number() over (partition by competitor_id order by detected_at desc) as rn
      from detected_changes where competitor_id in ${tx(competitors.map((c) => c.id))} and category in ('announcement', 'product', 'features')
        and review_status <> 'dismissed') x
    where rn <= 3`;

  const snap = (cid: string, type: string) => latest.find((l) => l.competitorId === cid && l.pageType === type);
  const rows: ComparisonRow[] = [];
  const row = (key: string, label: string, fn: (cid: string) => Cell, hint?: string) => {
    const cells: Record<string, Cell> = {};
    for (const c of competitors) cells[c.id] = fn(c.id);
    rows.push({ key, label, cells, hint });
  };

  row("positioning", "Positioning (homepage)", (cid) => {
    const s = snap(cid, "homepage");
    if (!s) return NA;
    const h1 = s.content.blocks.find((b) => b.k === "h1")?.t;
    const value = h1 ?? s.content.title;
    return value ? { value, items: s.content.description ? [s.content.description] : [], source: "competitor_claim", evidenceUrl: s.url, snapshotId: s.snapshotId, asOf: s.createdAt } : NA;
  }, "Headline and meta description as published by the competitor");

  row("pricing", "Published plans & prices", (cid) => {
    const s = snap(cid, "pricing");
    if (!s) return NA;
    const prices = s.content.prices.filter((p) => !p.struck && p.confidence !== "low");
    if (prices.length === 0) return { value: null, evidenceUrl: s.url, snapshotId: s.snapshotId, asOf: s.createdAt };
    const items = prices.slice(0, 8).map((p) => `${p.plan ?? "Unlabelled"}: ${formatMoney(p.amount, p.currency)}${periodLabel(p)}${p.promotional ? " (promotional)" : ""}${p.tax ? ` (${p.tax === "incl" ? "incl." : "excl."} tax)` : ""}`);
    return { value: `${new Set(prices.map((p) => p.plan ?? "?")).size} price point(s)`, items, source: "observed", evidenceUrl: s.url, snapshotId: s.snapshotId, asOf: s.createdAt };
  }, "Parsed from the latest pricing-page snapshot; currencies are not converted");

  row("entry_price", "Lowest standard monthly price", (cid) => {
    const s = snap(cid, "pricing");
    if (!s) return NA;
    const monthly = s.content.prices.filter((p) => p.period === "month" && !p.struck && !p.promotional && p.confidence !== "low" && p.amount > 0);
    if (monthly.length === 0) return NA;
    const currencies = new Set(monthly.map((p) => p.currency));
    if (currencies.size > 1) return { value: "Multiple currencies", source: "observed", evidenceUrl: s.url, snapshotId: s.snapshotId, asOf: s.createdAt };
    const min = monthly.reduce((a, b) => (b.amount < a.amount ? b : a));
    return { value: `${formatMoney(min.amount, min.currency)}${periodLabel(min)}`, items: min.plan ? [min.plan] : [], source: "derived", evidenceUrl: s.url, snapshotId: s.snapshotId, asOf: s.createdAt };
  });

  row("free_offer", "Free plan or trial mentioned", (cid) => {
    const s = snap(cid, "pricing") ?? snap(cid, "homepage");
    if (!s) return NA;
    const hit = s.content.blocks.find((b) => /\b(free plan|free forever|free trial|try (it )?free|start for free|\d+[- ]day trial)\b/i.test(b.t));
    return hit ? { value: "Mentioned", items: [hit.t.slice(0, 140)], source: "competitor_claim", evidenceUrl: s.url, snapshotId: s.snapshotId, asOf: s.createdAt } : { value: null, evidenceUrl: s.url };
  }, "Text match only; terms not verified");

  row("features", "Published feature headings", (cid) => {
    const s = snap(cid, "features") ?? snap(cid, "product");
    if (!s) return NA;
    const heads = s.content.blocks.filter((b) => (b.k === "h2" || b.k === "h3") && b.r !== "footer" && b.r !== "nav").map((b) => b.t).slice(0, 10);
    return heads.length ? { value: `${heads.length} headings`, items: heads, source: "competitor_claim", evidenceUrl: s.url, snapshotId: s.snapshotId, asOf: s.createdAt } : NA;
  }, "Competitor claims — not independently validated capabilities");

  row("activity", "Verified changes (90 days)", (cid) => {
    const a = activity.find((x) => x.competitorId === cid);
    return { value: String(a?.total ?? 0), items: a ? [`Pricing: ${a.pricing}`, `Product/features: ${a.product}`, `Announcements: ${a.announcements}`] : [], source: "observed" };
  }, "Counts only cover pages you monitor");

  row("announcements", "Recent product announcements", (cid) => {
    const list = announcements.filter((a) => a.competitorId === cid);
    return list.length ? { value: `${list.length} recent`, items: list.map((a) => `${a.detectedAt.toISOString().slice(0, 10)} — ${a.summary}`), source: "observed" } : NA;
  });

  // Custom criteria
  const criteria = await tx<{ id: string; name: string; description: string | null }[]>`
    select id, name, description from comparison_criteria where workspace_id = ${ctx.workspaceId} order by position, created_at`;
  if (criteria.length) {
    const values = await tx<{ criterionId: string; competitorId: string; value: string; source: Cell["source"]; evidenceUrl: string | null; updatedAt: Date }[]>`
      select criterion_id, competitor_id, value, source, evidence_url, updated_at from comparison_values
      where criterion_id in ${tx(criteria.map((c) => c.id))} and competitor_id in ${tx(competitors.map((c) => c.id))}`;
    for (const crit of criteria) {
      const cells: Record<string, Cell> = {};
      for (const c of competitors) {
        const v = values.find((x) => x.criterionId === crit.id && x.competitorId === c.id);
        cells[c.id] = v ? { value: v.value, source: v.source, evidenceUrl: v.evidenceUrl, asOf: v.updatedAt } : NA;
      }
      rows.push({ key: `criterion:${crit.id}`, label: crit.name, hint: crit.description ?? undefined, criterionId: crit.id, cells });
    }
  }
  return { competitors, rows };
}

export const criterionInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().transform((v) => v || null),
});

export async function addCriterion(tx: Tx, ctx: WorkspaceCtx, raw: z.input<typeof criterionInput>) {
  const input = criterionInput.parse(raw);
  const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from comparison_criteria where workspace_id = ${ctx.workspaceId}`;
  if (n >= 30) throw new AppError("You can define up to 30 custom criteria per workspace.", "limit");
  await tx`insert into comparison_criteria (organization_id, workspace_id, name, description, position) values (${ctx.orgId}, ${ctx.workspaceId}, ${input.name}, ${input.description}, ${n})`;
}

export async function deleteCriterion(tx: Tx, ctx: WorkspaceCtx, id: string) {
  assertUuid(id, "Criterion");
  await tx`delete from comparison_criteria where id = ${id} and workspace_id = ${ctx.workspaceId}`;
}

export const valueInput = z.object({
  criterionId: z.string().uuid(),
  competitorId: z.string().uuid(),
  value: z.string().trim().max(300),
  source: z.enum(["competitor_claim", "validated", "user_note"]),
  evidenceUrl: z.string().trim().max(2048).optional().transform((v) => (v && /^https?:\/\//.test(v) ? v : null)),
});

export async function setCriterionValue(tx: Tx, ctx: WorkspaceCtx, raw: z.input<typeof valueInput>) {
  const input = valueInput.parse(raw);
  const [crit] = await tx`select id from comparison_criteria where id = ${input.criterionId} and workspace_id = ${ctx.workspaceId}`;
  const [comp] = await tx`select id from competitors where id = ${input.competitorId} and workspace_id = ${ctx.workspaceId}`;
  if (!crit || !comp) throw new AppError("Not found", "not_found");
  if (!input.value) {
    await tx`delete from comparison_values where criterion_id = ${input.criterionId} and competitor_id = ${input.competitorId}`;
    return;
  }
  await tx`insert into comparison_values (organization_id, criterion_id, competitor_id, value, source, evidence_url)
    values (${ctx.orgId}, ${input.criterionId}, ${input.competitorId}, ${input.value}, ${input.source}, ${input.evidenceUrl})
    on conflict (criterion_id, competitor_id) do update set value = excluded.value, source = excluded.source, evidence_url = excluded.evidence_url`;
}

export function comparisonToCsv(c: Comparison): string {
  const esc = (s: string) => {
    const v = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // neutralize spreadsheet formula injection
    return `"${v.replace(/"/g, '""')}"`;
  };
  const header = ["Criterion", ...c.competitors.map((x) => x.name)].map(esc).join(",");
  const lines = c.rows.map((r) =>
    [r.label, ...c.competitors.map((x) => {
      const cell = r.cells[x.id]!;
      const text = cell.value === null ? "Not available" : [cell.value, ...(cell.items ?? [])].join(" | ");
      return cell.source ? `${text} [${cell.source.replace("_", " ")}]` : text;
    })].map(esc).join(","),
  );
  return [header, ...lines].join("\r\n");
}
