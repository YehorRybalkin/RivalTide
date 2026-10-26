import { z } from "zod";
import { systemDb, withUser, type Tx } from "../db";
import { audit } from "../audit";
import { assertWithinLimit, requireFeature, getEntitlements } from "../billing/entitlements";
import { env } from "../env";
import { randomToken, sha256 } from "../auth/password";
import { escapeHtml, layout, sendEmail } from "../email";
import { assertUuid, requireOwner, type WorkspaceCtx } from "./context";
import { AppError } from "./errors";
import { emailSchema } from "./accounts";

export const workspaceInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  clientName: z.string().trim().max(120).optional().transform((v) => v || null),
  description: z.string().trim().max(1000).optional().transform((v) => v || null),
  brandName: z.string().trim().max(80).optional().transform((v) => v || null),
  brandColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Use a hex colour like #10B981").optional().or(z.literal("").transform(() => undefined)).transform((v) => v || null),
});

export async function createWorkspace(tx: Tx, userId: string, orgId: string, raw: z.input<typeof workspaceInput>): Promise<string> {
  const input = workspaceInput.parse(raw);
  const [m] = await tx<{ role: string; isDemo: boolean }[]>`select m.role, o.is_demo from memberships m join organizations o on o.id = m.organization_id where m.organization_id = ${orgId} and m.user_id = ${userId}`;
  if (!m) throw new AppError("Organization not found", "not_found");
  if (m.isDemo) throw new AppError("The demo is read-only.", "forbidden");
  const ent = await assertWithinLimit(tx, orgId, "workspaces");
  if ((input.brandName || input.brandColor) && !ent.limits.whiteLabel) requireFeature(ent, "whiteLabel");
  const [row] = await tx<{ id: string }[]>`
    insert into client_workspaces (organization_id, name, client_name, description, brand_name, brand_color)
    values (${orgId}, ${input.name}, ${input.clientName}, ${input.description}, ${input.brandName}, ${input.brandColor}) returning id`;
  await tx`insert into notification_preferences (organization_id, user_id, workspace_id) values (${orgId}, ${userId}, ${row!.id}) on conflict do nothing`;
  await audit(tx, { orgId, actorId: userId, action: "workspace.create", targetType: "client_workspace", targetId: row!.id });
  return row!.id;
}

export async function updateWorkspace(tx: Tx, ctx: WorkspaceCtx, raw: z.input<typeof workspaceInput> & { defaultCheckIntervalHours?: number }) {
  if (ctx.isDemo) throw new AppError("The demo is read-only.", "forbidden");
  const input = workspaceInput.parse(raw);
  const ent = await getEntitlements(tx, ctx.orgId);
  if ((input.brandName || input.brandColor) && !ent.limits.whiteLabel) requireFeature(ent, "whiteLabel");
  const interval = Math.max(ent.limits.minCheckIntervalHours, Math.min(720, Number(raw.defaultCheckIntervalHours ?? 24) || 24));
  await tx`update client_workspaces set name = ${input.name}, client_name = ${input.clientName}, description = ${input.description},
    brand_name = ${input.brandName}, brand_color = ${input.brandColor}, default_check_interval_hours = ${interval} where id = ${ctx.workspaceId}`;
  await tx`update monitored_pages set check_interval_hours = ${interval} where workspace_id = ${ctx.workspaceId}`;
}

export async function archiveWorkspace(tx: Tx, ctx: WorkspaceCtx) {
  requireOwner(ctx);
  if (ctx.isDemo) throw new AppError("The demo is read-only.", "forbidden");
  const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from client_workspaces where organization_id = ${ctx.orgId} and archived_at is null`;
  if (n <= 1) throw new AppError("You cannot archive your only workspace.", "invalid");
  await tx`update client_workspaces set archived_at = now() where id = ${ctx.workspaceId}`;
  await tx`update competitors set status = 'paused' where workspace_id = ${ctx.workspaceId} and status = 'active'`;
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "workspace.archive", targetType: "client_workspace", targetId: ctx.workspaceId });
}

export async function renameOrganization(tx: Tx, ctx: WorkspaceCtx, name: string) {
  requireOwner(ctx);
  const n = z.string().trim().min(1).max(120).parse(name);
  await tx`update organizations set name = ${n} where id = ${ctx.orgId}`;
}

export async function listMembers(tx: Tx, orgId: string) {
  const members = await tx<{ userId: string; name: string; email: string; role: "owner" | "member"; createdAt: Date }[]>`
    select m.user_id, u.name, u.email, m.role, m.created_at from memberships m join users u on u.id = m.user_id
    where m.organization_id = ${orgId} order by m.created_at`;
  return members;
}

export async function listInvitations(tx: Tx, ctx: WorkspaceCtx) {
  if (ctx.role !== "owner") return [];
  return tx<{ id: string; email: string; role: string; expiresAt: Date }[]>`
    select id, email, role, expires_at from invitations where organization_id = ${ctx.orgId} and accepted_at is null and expires_at > now() order by created_at desc`;
}

export async function inviteMember(tx: Tx, ctx: WorkspaceCtx, emailRaw: string, role: "owner" | "member"): Promise<{ emailStatus: string; link: string }> {
  requireOwner(ctx);
  if (ctx.isDemo) throw new AppError("The demo is read-only.", "forbidden");
  const email = emailSchema.parse(emailRaw);
  const [{ pending } = { pending: 0 }] = await tx<{ pending: number }[]>`select count(*)::int as pending from invitations where organization_id = ${ctx.orgId} and accepted_at is null and expires_at > now()`;
  await assertWithinLimit(tx, ctx.orgId, "seats", 1 + pending);
  const token = randomToken();
  await tx`insert into invitations (organization_id, email, role, token_hash, invited_by, expires_at)
    values (${ctx.orgId}, ${email}, ${role}, ${sha256(token)}, ${ctx.userId}, now() + interval '7 days')`;
  const link = `${env().APP_URL}/invite/${token}`;
  const res = await sendEmail({
    orgId: ctx.orgId, userId: null, to: email, template: "invitation", subject: `You're invited to ${ctx.orgName} on RivalTide`,
    text: `You have been invited to join ${ctx.orgName} on RivalTide. Accept within 7 days: ${link}`,
    html: layout(`Join ${ctx.orgName} on RivalTide`, `<p>You have been invited to collaborate on competitive intelligence.</p><p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#10B981;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Accept invitation</a></p>`),
  });
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "member.invite", metadata: { role } });
  return { emailStatus: res.status, link };
}

export async function revokeInvitation(tx: Tx, ctx: WorkspaceCtx, id: string) {
  requireOwner(ctx);
  assertUuid(id, "Invitation");
  await tx`delete from invitations where id = ${id} and organization_id = ${ctx.orgId}`;
}

export async function acceptInvitation(userId: string, userEmail: string, token: string): Promise<string> {
  const db = systemDb();
  return db.begin(async (tx) => {
    const [inv] = await tx<{ id: string; organizationId: string; email: string; role: "owner" | "member" }[]>`
      select id, organization_id, email, role from invitations where token_hash = ${sha256(token)} and accepted_at is null and expires_at > now() for update`;
    if (!inv) throw new AppError("This invitation is invalid or has expired.", "invalid");
    if (inv.email.toLowerCase() !== userEmail.toLowerCase()) throw new AppError(`This invitation was sent to ${inv.email}. Sign in with that address to accept it.`, "forbidden");
    await tx`insert into memberships (organization_id, user_id, role) values (${inv.organizationId}, ${userId}, ${inv.role}) on conflict do nothing`;
    await tx`update invitations set accepted_at = now() where id = ${inv.id}`;
    const wss = await tx<{ id: string }[]>`select id from client_workspaces where organization_id = ${inv.organizationId} and archived_at is null`;
    for (const w of wss) await tx`insert into notification_preferences (organization_id, user_id, workspace_id) values (${inv.organizationId}, ${userId}, ${w.id}) on conflict do nothing`;
    await audit(tx, { orgId: inv.organizationId, actorId: userId, action: "member.join" });
    return inv.organizationId;
  });
}

export async function removeMember(tx: Tx, ctx: WorkspaceCtx, userId: string) {
  requireOwner(ctx);
  assertUuid(userId, "Member");
  if (userId === ctx.userId) throw new AppError("You cannot remove yourself. Transfer ownership first.", "invalid");
  await tx`delete from memberships where organization_id = ${ctx.orgId} and user_id = ${userId}`;
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "member.remove", targetType: "user", targetId: userId });
}

export const notificationInput = z.object({
  mode: z.enum(["all", "high_priority", "pricing_only", "digest_only", "none"]),
  emailEnabled: z.boolean(),
  digest: z.enum(["none", "daily", "weekly"]),
});

export async function getNotificationPrefs(tx: Tx, ctx: WorkspaceCtx) {
  const [row] = await tx<{ mode: string; emailEnabled: boolean; digest: string }[]>`
    select mode, email_enabled, digest from notification_preferences where user_id = ${ctx.userId} and workspace_id = ${ctx.workspaceId}`;
  return row ?? { mode: "all", emailEnabled: true, digest: "weekly" };
}

export async function setNotificationPrefs(tx: Tx, ctx: WorkspaceCtx, raw: z.input<typeof notificationInput>) {
  const input = notificationInput.parse(raw);
  await tx`insert into notification_preferences (organization_id, user_id, workspace_id, mode, email_enabled, digest)
    values (${ctx.orgId}, ${ctx.userId}, ${ctx.workspaceId}, ${input.mode}, ${input.emailEnabled}, ${input.digest})
    on conflict (user_id, workspace_id) do update set mode = excluded.mode, email_enabled = excluded.email_enabled, digest = excluded.digest`;
}

export async function listAlerts(tx: Tx, userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  return tx<{ id: string; workspaceId: string; workspaceName: string; changeId: string | null; title: string; body: string; severity: string; readAt: Date | null; emailedAt: Date | null; createdAt: Date }[]>`
    select a.id, a.workspace_id, w.name as workspace_name, a.change_id, a.title, a.body, a.severity, a.read_at, a.emailed_at, a.created_at
    from alerts a join client_workspaces w on w.id = a.workspace_id
    where a.user_id = ${userId} ${opts.unreadOnly ? tx`and a.read_at is null` : tx``}
    order by a.created_at desc limit ${opts.limit ?? 50}`;
}

export async function unreadAlertCount(tx: Tx, userId: string): Promise<number> {
  const [r] = await tx<{ n: number }[]>`select count(*)::int as n from alerts where user_id = ${userId} and read_at is null`;
  return r?.n ?? 0;
}

export async function markAlertsRead(tx: Tx, userId: string, ids?: string[]) {
  if (ids && ids.length) {
    ids.forEach((id) => assertUuid(id, "Alert"));
    await tx`update alerts set read_at = now() where user_id = ${userId} and id in ${tx(ids)} and read_at is null`;
  } else {
    await tx`update alerts set read_at = now() where user_id = ${userId} and read_at is null`;
  }
}

/** Deletes an organization and all its data. Ownership is verified under RLS first; the delete itself runs outside that transaction. */
export async function deleteOrganization(userId: string, orgId: string) {
  assertUuid(orgId, "Organization");
  const isOwner = await withUser(userId, async (tx) => {
    const [r] = await tx<{ ok: boolean }[]>`select app_is_org_owner(${orgId}) as ok`;
    return Boolean(r?.ok);
  });
  if (!isOwner) throw new AppError("Only organization owners can do this.", "forbidden");
  await systemDb()`delete from organizations where id = ${orgId}`;
}
