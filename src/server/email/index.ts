import { systemDb } from "../db";
import { recordUsage } from "../audit";
import { env, isEmailConfigured } from "../env";

export interface EmailMessage {
  orgId: string | null;
  userId: string | null;
  to: string;
  subject: string;
  template: string;
  html: string;
  text: string;
}

export interface EmailOutcome {
  status: "sent" | "failed" | "skipped_not_configured";
  deliveryId: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #E2E8F0;border-radius:12px">
<tr><td style="padding:20px 28px;border-bottom:1px solid #E2E8F0;font-weight:600">RivalTide</td></tr>
<tr><td style="padding:28px"><h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B">You receive this because of your RivalTide notification settings. Manage them in Settings → Notifications.</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendViaResend(msg: EmailMessage): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env().RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env().EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Resend HTTP ${res.status}: ${body.slice(0, 200)}`) as Error & { retryable?: boolean };
    err.retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  const json = (await res.json()) as { id?: string };
  return json.id ?? "";
}

/**
 * Sends an email through the configured provider and records a delivery log.
 * When no provider is configured the message is logged locally and recorded
 * as `skipped_not_configured` — the UI never claims it was sent.
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailOutcome> {
  const db = systemDb();
  const provider = isEmailConfigured() ? "resend" : env().EMAIL_PROVIDER === "none" ? "none" : "log";
  const [row] = await db<{ id: string }[]>`
    insert into email_deliveries (organization_id, user_id, to_email, template, subject, provider, status)
    values (${msg.orgId}, ${msg.userId}, ${msg.to}, ${msg.template}, ${msg.subject}, ${provider}, 'queued') returning id`;
  const id = row!.id;

  if (provider !== "resend") {
    if (provider === "log" && env().NODE_ENV !== "production") {
      console.info(`[email:stub] to=${msg.to} subject="${msg.subject}"\n${msg.text}\n`);
    }
    await db`update email_deliveries set status = 'skipped_not_configured' where id = ${id}`;
    return { status: "skipped_not_configured", deliveryId: id };
  }

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const providerId = await sendViaResend(msg);
      await db`update email_deliveries set status = 'sent', provider_message_id = ${providerId}, attempts = ${attempt}, sent_at = now() where id = ${id}`;
      await recordUsage(db, msg.orgId, "email", 1, 0, { template: msg.template });
      return { status: "sent", deliveryId: id };
    } catch (e) {
      lastError = (e as Error).message;
      if (!(e as { retryable?: boolean }).retryable) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  await db`update email_deliveries set status = 'failed', attempts = attempts + 1, last_error = ${lastError.slice(0, 500)} where id = ${id}`;
  return { status: "failed", deliveryId: id };
}
