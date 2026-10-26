import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { systemDb, withUser } from "@/server/db";
import { addPages, createCompetitor, setPageStatus } from "@/server/services/competitors";
import { enqueueManualCheck, runJobInline, runQueueOnce } from "@/server/monitoring/runner";
import { enqueuePageCheck, claimJobs, recoverStuckJobs } from "@/server/monitoring/queue";
import { giveFeedback, getChange, listChanges } from "@/server/services/changes";
import { generateReport, getReport } from "@/server/services/reports";
import { discoverPages } from "@/server/services/discovery";
import { clearDomainState, html, makeTenant, startFixtureSite, type FixtureSite } from "./helpers";

let site: FixtureSite;
beforeAll(async () => {
  site = await startFixtureSite();
});
afterAll(async () => site.close());
beforeEach(async () => {
  site.routes.clear();
  site.hits.length = 0;
  site.routes.set("/robots.txt", { body: "User-agent: *\nDisallow: /private\n", type: "text/plain" });
  await clearDomainState();
});

const pricing = (growth: string) => html("Pricing", `<h1>Pricing</h1><section><h3>Starter</h3><p>€9</p><p>per month</p></section><section><h3>Growth</h3><p>${growth}</p><p>per month</p></section><p>Updated 3 minutes ago</p>`);

async function setup(paths: { path: string; type?: "pricing" | "homepage" | "blog" | "features" }[]) {
  const t = await makeTenant("mon");
  const ctx = await t.ctx();
  const competitorId = await withUser(t.userId, (tx) => createCompetitor(tx, ctx, { name: "Fixture Co", websiteUrl: site.origin }));
  const pageIds = await withUser(t.userId, (tx) => addPages(tx, ctx, competitorId, paths.map((p) => ({ url: `${site.origin}${p.path}`, pageType: p.type }))));
  const check = async (i = 0) => {
    const jobId = await withUser(t.userId, (tx) => enqueueManualCheck(tx, { orgId: t.orgId, pageId: pageIds[i]!, trigger: "manual" }));
    // Each manual request in the same minute shares an idempotency key; use a unique key for test sequencing.
    await systemDb()`update monitoring_jobs set idempotency_key = idempotency_key || ':' || gen_random_uuid() where id = ${jobId}`;
    return runJobInline(jobId);
  };
  return { t, ctx, competitorId, pageIds, check };
}

describe("monitoring pipeline", () => {
  it("creates a baseline, ignores volatile noise, then records a verified pricing change with evidence", async () => {
    site.routes.set("/pricing", { body: pricing("€29") });
    const { t, ctx, pageIds, check } = await setup([{ path: "/pricing", type: "pricing" }]);

    const r1 = await check();
    expect(r1?.outcome).toBe("baseline");
    let changes = await withUser(t.userId, (tx) => listChanges(tx, ctx, { page: 1 }));
    expect(changes.total).toBe(0); // never a change from a single snapshot

    site.routes.set("/pricing", { body: pricing("€29").replace("3 minutes ago", "9 minutes ago") });
    expect((await check())?.outcome).toBe("unchanged");

    site.routes.set("/pricing", { body: pricing("€39") });
    const r3 = await check();
    expect(r3?.outcome).toBe("changed");
    changes = await withUser(t.userId, (tx) => listChanges(tx, ctx, { page: 1 }));
    expect(changes.total).toBe(1);
    const change = await withUser(t.userId, (tx) => getChange(tx, ctx, changes.items[0]!.id));
    expect(change.category).toBe("pricing");
    expect(change.severity).toBe("high");
    expect(change.summary).toContain("€29");
    expect(change.summary).toContain("€39");
    expect(change.evidence.priceChanges[0]?.kind).toBe("amount_changed");
    expect(change.previousSnapshotId).not.toBe(change.newSnapshotId);

    const [page] = await systemDb()<{ health: string; snapshotCount: number }[]>`select health, snapshot_count from monitored_pages where id = ${pageIds[0]!}`;
    expect(page).toMatchObject({ health: "healthy", snapshotCount: 2 });

    // Insight (deterministic fallback, AI not configured) and alert were generated.
    const insights = await systemDb()<{ generatedBy: string; observedFacts: string[] }[]>`select generated_by, observed_facts from ai_insights where change_id = ${change.id}`;
    expect(insights[0]?.generatedBy).toBe("deterministic");
    expect(insights[0]?.observedFacts.join(" ")).toContain("€39");
    const alerts = await systemDb()`select * from alerts where change_id = ${change.id}`;
    expect(alerts).toHaveLength(1);
    // Email provider not configured: delivery recorded honestly as skipped.
    const emails = await systemDb()<{ status: string }[]>`select status from email_deliveries where user_id = ${t.userId} and template = 'change_alert'`;
    expect(emails.every((e) => e.status === "skipped_not_configured")).toBe(true);
  });

  it("deduplicates flip-flopping content and never alerts twice", async () => {
    site.routes.set("/", { body: html("Home", "<h1>Hello</h1><p>Banner A</p>") });
    const { t, check } = await setup([{ path: "/", type: "homepage" }]);
    await check();
    site.routes.set("/", { body: html("Home", "<h1>Hello</h1><p>Banner B is new</p>") });
    expect((await check())?.outcome).toBe("changed");
    site.routes.set("/", { body: html("Home", "<h1>Hello</h1><p>Banner A</p>") });
    expect((await check())?.outcome).toBe("changed");
    site.routes.set("/", { body: html("Home", "<h1>Hello</h1><p>Banner B is new</p>") });
    expect((await check())?.outcome).toBe("unchanged"); // same fingerprint as the first change
    const [{ n } = { n: -1 }] = await systemDb()<{ n: number }[]>`select count(*)::int as n from detected_changes where organization_id = ${t.orgId}`;
    expect(n).toBe(2);
  });

  it("records robots.txt blocks as restricted health, not as changes", async () => {
    site.routes.set("/private", { body: html("Private", "<p>secret</p>") });
    const { t, pageIds, check } = await setup([{ path: "/private" }]);
    const r = await check();
    expect(r?.outcome).toBe("blocked_robots");
    expect(site.hits.some((h) => h.startsWith("GET /private"))).toBe(false); // page itself never fetched
    const [p] = await systemDb()<{ health: string }[]>`select health from monitored_pages where id = ${pageIds[0]!}`;
    expect(p?.health).toBe("restricted");
    const changes = await systemDb()`select 1 from detected_changes where organization_id = ${t.orgId}`;
    expect(changes).toHaveLength(0);
  });

  it("treats HTTP errors, access denial and challenge pages as health events", async () => {
    site.routes.set("/a", { status: 500, body: "oops" });
    site.routes.set("/b", { status: 403, body: "forbidden" });
    site.routes.set("/c", { body: html("Just a moment...", "<p>Checking your browser before accessing the site.</p>") });
    site.routes.set("/d", { body: "{}", type: "application/json" });
    const { t, pageIds, check } = await setup([{ path: "/a" }, { path: "/b" }, { path: "/c" }, { path: "/d" }]);
    expect((await check(0))?.outcome).toBe("http_error");
    expect((await check(1))?.outcome).toBe("access_denied");
    expect((await check(2))?.outcome).toBe("access_denied");
    expect((await check(3))?.outcome).toBe("unsupported_content");
    const health = await systemDb()<{ id: string; health: string }[]>`select id, health from monitored_pages where id in ${systemDb()(pageIds)}`;
    const byId = Object.fromEntries(health.map((h) => [h.id, h.health]));
    expect(byId[pageIds[0]!]).toBe("delayed");
    expect(byId[pageIds[1]!]).toBe("restricted");
    expect(byId[pageIds[2]!]).toBe("restricted");
    const snaps = await systemDb()`select 1 from snapshots where organization_id = ${t.orgId}`;
    expect(snaps).toHaveLength(0);
    const alerts = await systemDb()`select 1 from alerts where organization_id = ${t.orgId}`;
    expect(alerts).toHaveLength(0);
  });

  it("does not report an extraction collapse as removed content", async () => {
    const big = Array.from({ length: 60 }, (_, i) => `<p>Paragraph number ${i} with plenty of descriptive product text.</p>`).join("");
    site.routes.set("/", { body: html("Home", `<h1>Big page</h1>${big}`) });
    const { t, check } = await setup([{ path: "/", type: "homepage" }]);
    await check();
    site.routes.set("/", { body: html("Home", "<div id='root'></div>") });
    expect((await check())?.outcome).toBe("empty_content");
    const changes = await systemDb()`select 1 from detected_changes where organization_id = ${t.orgId}`;
    expect(changes).toHaveLength(0);
  });

  it("suppresses content the user marked irrelevant", async () => {
    site.routes.set("/blog", { body: html("Blog", "<h1>Blog</h1><p>Tip of the day: one</p>") });
    const { t, ctx, check } = await setup([{ path: "/blog", type: "blog" }]);
    await check();
    site.routes.set("/blog", { body: html("Blog", "<h1>Blog</h1><p>Tip of the day: two</p>") });
    await check();
    const list = await withUser(t.userId, (tx) => listChanges(tx, ctx, { page: 1 }));
    await withUser(t.userId, (tx) => giveFeedback(tx, ctx, list.items[0]!.id, "irrelevant"));
    site.routes.set("/blog", { body: html("Blog", "<h1>Blog</h1><p>Tip of the day: one</p>") });
    expect((await check())?.outcome).toBe("unchanged");
  });

  it("prevents duplicate concurrent jobs per page and recovers stuck jobs", async () => {
    site.routes.set("/", { body: html("Home", "<h1>Hi</h1>") });
    const { t, pageIds } = await setup([{ path: "/" }]);
    const db = systemDb();
    const a = await enqueuePageCheck(db, { orgId: t.orgId, pageId: pageIds[0]!, trigger: "scheduled", slot: "s1" });
    const b = await enqueuePageCheck(db, { orgId: t.orgId, pageId: pageIds[0]!, trigger: "scheduled", slot: "s2" });
    const c = await enqueuePageCheck(db, { orgId: t.orgId, pageId: pageIds[0]!, trigger: "scheduled", slot: "s1" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(c.created).toBe(false);
    expect(b.jobId).toBe(a.jobId);
    const claimed = await claimJobs("w1", 5, a.jobId);
    expect(claimed).toHaveLength(1);
    expect(await claimJobs("w2", 5, a.jobId)).toHaveLength(0);
    await db`update monitoring_jobs set locked_until = now() - interval '1 minute' where id = ${a.jobId}`;
    expect(await recoverStuckJobs()).toBeGreaterThanOrEqual(1);
    const [job] = await db<{ status: string }[]>`select status from monitoring_jobs where id = ${a.jobId}`;
    expect(job?.status).toBe("queued");
    await db`update monitoring_jobs set status = 'cancelled' where id = ${a.jobId}`;
  });

  it("scheduler picks up due pages and skips paused ones", async () => {
    site.routes.set("/", { body: html("Home", "<h1>Scheduled</h1><p>Body</p>") });
    site.routes.set("/features", { body: html("Features", "<h1>Features</h1>") });
    const { t, ctx, pageIds } = await setup([{ path: "/" }, { path: "/features" }]);
    await withUser(t.userId, (tx) => setPageStatus(tx, ctx, pageIds[1]!, "paused"));
    await systemDb()`update monitoring_jobs set status = 'cancelled' where status in ('queued', 'running')`;
    const results = await runQueueOnce("test-worker", 10);
    const [p1] = await systemDb()<{ snapshotCount: number }[]>`select snapshot_count from monitored_pages where id = ${pageIds[0]!}`;
    const [p2] = await systemDb()<{ snapshotCount: number }[]>`select snapshot_count from monitored_pages where id = ${pageIds[1]!}`;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(p1?.snapshotCount).toBe(1);
    expect(p2?.snapshotCount).toBe(0);
  });

  it("identifies itself with the RivalTide user agent", async () => {
    site.routes.set("/", { body: html("Home", "<h1>UA</h1>") });
    const { check } = await setup([{ path: "/" }]);
    await check();
    expect(site.hits.some((h) => h.includes("RivalTideBot"))).toBe(true);
  });

  it("generates a report with frozen evidence that later changes do not alter", async () => {
    site.routes.set("/pricing", { body: pricing("€29") });
    const { t, ctx, check } = await setup([{ path: "/pricing", type: "pricing" }]);
    await check();
    site.routes.set("/pricing", { body: pricing("€49") });
    await check();
    const reportId = await withUser(t.userId, (tx) => generateReport(tx, ctx, { type: "weekly_brief", periodDays: 7 }));
    const before = await withUser(t.userId, (tx) => getReport(tx, ctx, reportId));
    expect(before.content.pricing).toHaveLength(1);
    expect(before.content.pricing[0]?.evidence.prices[0]).toContain("€49");
    expect(before.content.coverage.notes.join(" ")).toMatch(/Coverage is limited/);
    site.routes.set("/pricing", { body: pricing("€59") });
    await check();
    const after = await withUser(t.userId, (tx) => getReport(tx, ctx, reportId));
    expect(after.contentHash).toBe(before.contentHash);
    expect(JSON.stringify(after.content)).not.toContain("€59");
    const pinned = await systemDb()<{ n: number }[]>`select count(*)::int as n from snapshots where organization_id = ${t.orgId} and pinned`;
    expect(pinned[0]!.n).toBeGreaterThanOrEqual(2);
  });

  it("discovers suggested pages from the homepage without crawling", async () => {
    site.routes.set("/", { body: html("Fixture Co — Home", "<h1>Welcome</h1>") });
    const result = await discoverPages(site.origin);
    expect(result.reachable).toBe(true);
    expect(result.title).toBe("Fixture Co — Home");
    const types = result.suggestions.map((s) => s.pageType);
    expect(types).toEqual(expect.arrayContaining(["homepage", "pricing", "features", "blog"]));
    expect(site.hits.filter((h) => h.startsWith("GET /pricing"))).toHaveLength(0);
  });

  it("rejects private destinations during discovery", async () => {
    const r = await discoverPages("http://169.254.169.254/latest/meta-data/");
    expect(r.reachable).toBe(false);
    expect(r.problem).toMatch(/private|reserved/i);
  });
});
