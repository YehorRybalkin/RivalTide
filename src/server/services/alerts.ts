import { systemDb } from "../db";
import { env } from "../env";
import { getEntitlements } from "../billing/entitlements";
import { escapeHtml, layout, sendEmail } from "../email";

const MAX_IMMEDIATE_EMAILS_PER_DAY = 20;
const CATEGORY_LABELS: Record<string, string> = {
  pricing: "Pricing", product: "Product", features: "Features", positioning: "Positioning",
  announcement: "Announcement", general: "General update", unclassified: "Needs review",
};

interface ChangeInfo {
  id: string;
  organizationId: string;
  workspaceId: string;
  workspaceName: string;
  competitorName: string;
  category: string;
  severity: "low" | "medium" | "high";
  summary: string;
  sourceUrl: string;
  needsReview: boolean;
  isDemo: boolean;
}

interface Recipient {
  userId: string;
  email: string;
  isDemo: boolean;
  mode: "all" | "high_priority" | "pricing_only" | "digest_only" | "none";
  emailEnabled: boolean;
}

/** Decides whether a change should notify a user under their preference. Pure; unit-tested. */
export function shouldAlert(mode: Recipient["mode"], change: { severity: string; category: string }): boolean {
  if (change.severity === "low") return false; // only material changes notify
  switch (mode) {
    case "none": return false;
    case "high_priority": return change.severity === "high";
    case "pricing_only": return change.category === "pricing";
    default: return true;
  }
}

export async function createAlertsForChange(changeId: string): Promise<{ alerts: number; emails: number }> {
  const db = systemDb();
  const [change] = await db<ChangeInfo[]>`
    select d.id, d.organization_id, d.workspace_id, w.name as workspace_name, c.name as competitor_name, d.category, d.severity,
      d.summary, d.source_url, d.needs_review, o.is_demo
    from detected_changes d join competitors c on c.id = d.competitor_id
    join client_workspaces w on w.id = d.workspace_id join organizations o on o.id = d.organization_id
    where d.id = ${changeId}`;
  if (!change) return { alerts: 0, emails: 0 };

  const recipients = await db<Recipient[]>`
    select u.id as user_id, u.email, u.is_demo, coalesce(np.mode, 'all') as mode, coalesce(np.email_enabled, true) as email_enabled
    from memberships m join users u on u.id = m.user_id
    left join notification_preferences np on np.user_id = u.id and np.workspace_id = ${change.workspaceId}
    where m.organization_id = ${change.organizationId}`;
  const ent = await getEntitlements(db, change.organizationId);
  let alerts = 0;
  let emails = 0;
  const title = `${change.competitorName}: ${CATEGORY_LABELS[change.category] ?? change.category}`;

  for (const r of recipients) {
    if (!shouldAlert(r.mode, change)) continue;
    const inserted = await db<{ id: string }[]>`
      insert into alerts (organization_id, workspace_id, user_id, change_id, title, body, severity)
      values (${change.organizationId}, ${change.workspaceId}, ${r.userId}, ${change.id}, ${title}, ${change.summary}, ${change.severity})
      on conflict (user_id, change_id) do nothing returning id`;
    if (!inserted[0]) continue; // never alert twice for the same change
    alerts++;

    if (r.mode === "digest_only" || !r.emailEnabled || r.isDemo || change.isDemo || !ent.limits.emailAlerts || !ent.active) continue;
    const [{ n } = { n: 0 }] = await db<{ n: number }[]>`
      select count(*)::int as n from email_deliveries where user_id = ${r.userId} and template = 'change_alert' and created_at > now() - interval '1 day'`;
    if (n >= MAX_IMMEDIATE_EMAILS_PER_DAY) continue;
    const link = `${env().APP_URL}/app/${change.workspaceId}/changes/${change.id}`;
    const result = await sendEmail({
      orgId: change.organizationId,
      userId: r.userId,
      to: r.email,
      template: "change_alert",
      subject: `[RivalTide] ${title}`,
      text: `${change.summary}\n\nWorkspace: ${change.workspaceName}\nSource: ${change.sourceUrl}\nView evidence: ${link}`,
      html: layout(title, `<p style="margin:0 0 12px">${escapeHtml(change.summary)}</p>
        <p style="margin:0 0 12px;color:#64748B;font-size:13px">Workspace: ${escapeHtml(change.workspaceName)} · Severity: ${change.severity}${change.needsReview ? " · Needs review" : ""}</p>
        <p style="margin:0 0 20px;color:#64748B;font-size:13px">Source: ${escapeHtml(change.sourceUrl)}</p>
        <a href="${escapeHtml(link)}" style="background:#10B981;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">View evidence</a>`),
    });
    if (result.status === "sent") {
      emails++;
      await db`update alerts set emailed_at = now() where id = ${inserted[0].id}`;
    }
  }
  return { alerts, emails };
}

/** Sends daily/weekly digests that are due. Returns number of digests attempted. */
export async function sendDueDigests(): Promise<number> {
  const db = systemDb();
  const due = await db<{ prefId: string; userId: string; email: string; organizationId: string; workspaceId: string; workspaceName: string; digest: "daily" | "weekly"; since: Date }[]>`
    select np.id as pref_id, u.id as user_id, u.email, np.organization_id, np.workspace_id, w.name as workspace_name, np.digest,
      coalesce(np.last_digest_at, np.created_at) as since
    from notification_preferences np join users u on u.id = np.user_id join client_workspaces w on w.id = np.workspace_id
    join organizations o on o.id = np.organization_id
    where np.digest <> 'none' and np.email_enabled and not u.is_demo and not o.is_demo
      and coalesce(np.last_digest_at, np.created_at) < now() - case when np.digest = 'daily' then interval '1 day' else interval '7 days' end
    limit 500`;
  let sent = 0;
  for (const d of due) {
    const ent = await getEntitlements(db, d.organizationId);
    const changes = await db<{ id: string; competitorName: string; category: string; severity: string; summary: string }[]>`
      select dc.id, c.name as competitor_name, dc.category, dc.severity, dc.summary from detected_changes dc join competitors c on c.id = dc.competitor_id
      where dc.workspace_id = ${d.workspaceId} and dc.detected_at > ${d.since} and dc.review_status <> 'dismissed' and dc.severity <> 'low'
      order by case dc.severity when 'high' then 0 when 'medium' then 1 else 2 end, dc.detected_at desc limit 25`;
    await db`update notification_preferences set last_digest_at = now() where id = ${d.prefId}`;
    if (changes.length === 0 || !ent.active || !ent.limits.emailAlerts) continue;
    const link = `${env().APP_URL}/app/${d.workspaceId}/changes`;
    const title = `${d.digest === "daily" ? "Daily" : "Weekly"} digest — ${d.workspaceName}`;
    await sendEmail({
      orgId: d.organizationId,
      userId: d.userId,
      to: d.email,
      template: "digest",
      subject: `[RivalTide] ${title}: ${changes.length} change${changes.length === 1 ? "" : "s"}`,
      text: changes.map((c) => `• ${c.competitorName} (${c.category}, ${c.severity}): ${c.summary}`).join("\n") + `\n\nOpen RivalTide: ${link}`,
      html: layout(title, `<ul style="padding-left:18px;margin:0 0 20px">${changes
        .map((c) => `<li style="margin-bottom:8px"><strong>${escapeHtml(c.competitorName)}</strong> <span style="color:#64748B">(${escapeHtml(CATEGORY_LABELS[c.category] ?? c.category)}, ${c.severity})</span><br>${escapeHtml(c.summary)}</li>`)
        .join("")}</ul><a href="${escapeHtml(link)}" style="background:#10B981;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Open change history</a>`),
    });
    sent++;
  }
  return sent;
}
