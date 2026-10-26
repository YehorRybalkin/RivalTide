import { systemDb, withUser } from "../db";
import { hashPassword, randomToken } from "../auth/password";
import { contentHash, extractContent, visibleTextLength, type NormalizedContent } from "../detection/extract";
import { detectChange } from "../detection/diff";
import { deterministicInsight } from "../ai/deterministic";
import { observedFacts } from "../ai/facts";
import { detectThemes } from "../services/insights";
import { createAlertsForChange } from "../services/alerts";
import { generateReport } from "../services/reports";
import { resolveWorkspace } from "../services/context";
import { DEMO_ANALYSES, DEMO_COMPETITORS } from "./fixtures";

const DEMO_HOURS = 24;

/**
 * Creates an isolated, ephemeral demo account with FICTIONAL data. Demo orgs
 * are flagged `is_demo`, never monitored, read-only, labeled everywhere in
 * the UI, and deleted automatically after 24 hours.
 */
export async function createDemoAccount(): Promise<{ userId: string; workspaceId: string }> {
  const db = systemDb();
  const { userId, orgId, workspaceId, secondWorkspaceId } = await db.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      insert into users (email, name, password_hash, is_demo)
      values (${`demo-${randomToken(9)}@demo.rivaltide.invalid`}, 'Demo Visitor', ${await hashPassword(randomToken())}, true)
      returning id`;
    const [org] = await tx<{ id: string }[]>`
      insert into organizations (name, is_demo, demo_expires_at) values ('Demo Agency (fictional)', true, now() + make_interval(hours => ${DEMO_HOURS})) returning id`;
    await tx`insert into memberships (organization_id, user_id, role) values (${org!.id}, ${user!.id}, 'owner')`;
    await tx`insert into subscriptions (organization_id, plan_id, status, is_paid, pilot_ends_at, pilot_note)
      values (${org!.id}, 'demo', 'pilot', false, now() + make_interval(hours => ${DEMO_HOURS}), 'Demo environment')`;
    const [ws] = await tx<{ id: string }[]>`
      insert into client_workspaces (organization_id, name, client_name, description, brand_name, brand_color)
      values (${org!.id}, 'Acme Insights (demo client)', 'Acme Insights', 'Fictional client workspace for the demo.', 'Demo Agency', '#2563EB') returning id`;
    const [ws2] = await tx<{ id: string }[]>`
      insert into client_workspaces (organization_id, name, client_name, description)
      values (${org!.id}, 'Lumen Retail (demo client)', 'Lumen Retail', 'Second fictional client, empty to show onboarding.') returning id`;
    for (const w of [ws!.id, ws2!.id]) {
      await tx`insert into notification_preferences (organization_id, user_id, workspace_id) values (${org!.id}, ${user!.id}, ${w})`;
    }
    return { userId: user!.id, orgId: org!.id, workspaceId: ws!.id, secondWorkspaceId: ws2!.id };
  });
  void secondWorkspaceId;

  const now = Date.now();
  const at = (daysAgo: number, hourOffset = 0) => new Date(now - daysAgo * 86400_000 + hourOffset * 3600_000);
  const changeIds: string[] = [];

  for (const comp of DEMO_COMPETITORS) {
    const [c] = await db<{ id: string }[]>`
      insert into competitors (organization_id, workspace_id, name, website_url, description, category, industry, created_by, created_at)
      values (${orgId}, ${workspaceId}, ${comp.name}, ${`https://${comp.domain}/`}, ${comp.description}, ${comp.category}, ${comp.industry}, ${userId}, ${at(45)})
      returning id`;
    for (const page of comp.pages) {
      const url = `https://${comp.domain}${page.path}`;
      const lastAttempt = at(0, -2);
      const [p] = await db<{ id: string }[]>`
        insert into monitored_pages (organization_id, workspace_id, competitor_id, url, page_type, status, health, health_detail,
          next_check_at, last_attempt_at, last_success_at, created_at)
        values (${orgId}, ${workspaceId}, ${c!.id}, ${url}, ${page.type}, 'active', ${page.health?.status ?? "healthy"}, ${page.health?.detail ?? null},
          now() + interval '22 hours', ${lastAttempt}, ${page.health ? at(page.versions[page.versions.length - 1]!.daysAgo) : lastAttempt}, ${at(45)})
        returning id`;
      let prev: { id: string; content: NormalizedContent } | null = null;
      let lastSnapId: string | null = null;
      for (const v of page.versions) {
        const content = extractContent(v.html, url);
        const fetchedAt = at(v.daysAgo);
        const [attempt] = await db<{ id: string }[]>`
          insert into monitoring_attempts (organization_id, page_id, outcome, http_status, final_url, duration_ms, bytes, created_at)
          values (${orgId}, ${p!.id}, ${prev ? "changed" : "baseline"}, 200, ${url}, 420, ${v.html.length}, ${fetchedAt}) returning id`;
        const [snap] = await db<{ id: string }[]>`
          insert into snapshots (organization_id, page_id, attempt_id, content_hash, content, text_length, final_url, http_status, pinned, created_at)
          values (${orgId}, ${p!.id}, ${attempt!.id}, ${contentHash(content)}, ${db.json(content as never)}, ${visibleTextLength(content)}, ${url}, 200, true, ${fetchedAt})
          returning id`;
        if (prev) {
          const cand = detectChange(prev.content, content, { pageType: page.type });
          if (cand) {
            const [ch] = await db<{ id: string }[]>`
              insert into detected_changes (organization_id, workspace_id, competitor_id, page_id, previous_snapshot_id, new_snapshot_id, source_url,
                category, severity, confidence, detection_method, summary, evidence, fingerprint, needs_review, detected_at, created_at, is_read)
              values (${orgId}, ${workspaceId}, ${c!.id}, ${p!.id}, ${prev.id}, ${snap!.id}, ${url}, ${cand.category}, ${cand.severity}, ${cand.confidence},
                ${cand.detectionMethod}, ${cand.summary}, ${db.json(cand.evidence as never)}, ${cand.fingerprint}, ${cand.needsReview}, ${fetchedAt}, ${fetchedAt}, ${v.daysAgo > 10})
              returning id`;
            changeIds.push(ch!.id);
            const forAnalysis = { id: ch!.id, competitorName: comp.name, pageType: page.type, sourceUrl: url, category: cand.category, severity: cand.severity, confidence: cand.confidence, summary: cand.summary, detectedAt: fetchedAt, evidence: cand.evidence };
            const sample = DEMO_ANALYSES[`${comp.name}:${cand.category}`];
            const base = deterministicInsight(forAnalysis);
            await db`insert into ai_insights (organization_id, workspace_id, competitor_id, change_id, kind, generated_by, title, importance, observed_facts,
                interpretation, who_affected, opportunities, threats, suggested_actions, uncertainty, source_change_ids, provider, model, saved_for_report, created_at)
              values (${orgId}, ${workspaceId}, ${c!.id}, ${ch!.id}, 'change_analysis', ${sample ? "ai" : "deterministic"}, ${base.title}, ${cand.severity},
                ${db.json(observedFacts(forAnalysis))}, ${sample?.interpretation ?? base.interpretation}, ${sample?.who ?? base.who_affected},
                ${db.json(sample?.opportunities ?? base.opportunities)}, ${db.json(sample?.threats ?? base.threats)}, ${db.json(sample?.actions ?? base.suggested_actions)},
                ${sample?.uncertainty ?? base.uncertainty}, ${[ch!.id]}, ${sample ? "demo" : null}, ${sample ? "demo-sample (written for the demo)" : null},
                ${Boolean(sample && cand.severity === "high")}, ${fetchedAt})`;
          }
        }
        prev = { id: snap!.id, content };
        lastSnapId = snap!.id;
      }
      await db`update monitored_pages set last_snapshot_id = ${lastSnapId}, snapshot_count = ${page.versions.length} where id = ${p!.id}`;
      // A few recent "unchanged" checks so monitoring history looks realistic.
      for (let d = 1; d <= 3; d++) {
        await db`insert into monitoring_attempts (organization_id, page_id, outcome, http_status, final_url, duration_ms, created_at)
          values (${orgId}, ${p!.id}, ${page.health ? "blocked_robots" : "unchanged"}, ${page.health ? null : 200}, ${url}, 380, ${at(d, -2)})`;
      }
    }
  }

  // Benchmarking criteria (fictional values, labeled by source).
  const [crit] = await db<{ id: string }[]>`
    insert into comparison_criteria (organization_id, workspace_id, name, description, position)
    values (${orgId}, ${workspaceId}, 'Agency features', 'Multi-client or white-label support', 0) returning id`;
  const comps = await db<{ id: string; name: string }[]>`select id, name from competitors where workspace_id = ${workspaceId}`;
  const vals: Record<string, [string, string]> = {
    "BeaconMetrics": ["White-label dashboards (claimed)", "competitor_claim"],
    "Flowboard": ["Agency plan with branded exports (claimed)", "competitor_claim"],
    "SignalStack": ["Agency messaging; no agency plan observed", "user_note"],
  };
  for (const c of comps) {
    const v = vals[c.name];
    if (v) await db`insert into comparison_values (organization_id, criterion_id, competitor_id, value, source) values (${orgId}, ${crit!.id}, ${c.id}, ${v[0]}, ${v[1]})`;
  }

  await detectThemes(workspaceId);
  for (const id of changeIds) await createAlertsForChange(id);
  await db`update alerts set read_at = created_at where organization_id = ${orgId} and created_at < now() - interval '10 days'`;
  await db`update alerts a set created_at = d.detected_at from detected_changes d where d.id = a.change_id and a.organization_id = ${orgId}`;

  await withUser(userId, async (tx) => {
    const ctx = await resolveWorkspace(tx, userId, workspaceId);
    await generateReport(tx, ctx, { type: "weekly_brief", periodDays: 7 });
    await generateReport(tx, ctx, { type: "client_report", periodDays: 30 });
  });
  return { userId, workspaceId };
}
