import { z } from "zod";
import { systemDb, withUser, type Db } from "../db";
import { env } from "../env";
import { audit } from "../audit";
import { DUMMY_HASH, hashPassword, randomToken, sha256, verifyPassword } from "../auth/password";
import { TRIAL_PLAN } from "../billing/plans";
import { escapeHtml, layout, sendEmail } from "../email";
import { AppError } from "./errors";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
export const passwordSchema = z.string().min(10, "Use at least 10 characters").max(200);
export const nameSchema = z.string().trim().min(1, "Required").max(120);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isOperator: boolean;
  isDemo: boolean;
}

export async function signUp(input: { email: string; password: string; name: string }): Promise<SessionUser> {
  const email = emailSchema.parse(input.email);
  const password = passwordSchema.parse(input.password);
  const name = nameSchema.parse(input.name);
  const db = systemDb();
  const passwordHash = await hashPassword(password);
  const rows = await db<SessionUser[]>`
    insert into users (email, name, password_hash) values (${email}, ${name}, ${passwordHash})
    on conflict (email) do nothing
    returning id, email, name, is_operator, is_demo`;
  if (!rows[0]) throw new AppError("An account with this email already exists. Try signing in.", "conflict");
  await audit(db, { orgId: null, actorId: rows[0].id, action: "user.signup" });
  return rows[0];
}

export async function authenticate(emailInput: string, password: string): Promise<SessionUser | null> {
  const parsed = emailSchema.safeParse(emailInput);
  const db = systemDb();
  const [user] = parsed.success
    ? await db<(SessionUser & { passwordHash: string })[]>`select id, email, name, is_operator, is_demo, password_hash from users where email = ${parsed.data}`
    : [];
  // Always run a hash comparison to avoid user-enumeration timing differences.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || user.isDemo) return null;
  const { passwordHash: _ignored, ...safe } = user;
  return safe;
}

/** Creates organization + owner membership + first workspace + trial subscription atomically. */
export async function createOrganization(userId: string, input: { orgName: string; workspaceName: string; clientName?: string | null }) {
  const orgName = nameSchema.parse(input.orgName);
  const workspaceName = nameSchema.parse(input.workspaceName);
  const db = systemDb();
  return db.begin(async (tx) => {
    const [org] = await tx<{ id: string }[]>`insert into organizations (name) values (${orgName}) returning id`;
    await tx`insert into memberships (organization_id, user_id, role) values (${org!.id}, ${userId}, 'owner')`;
    const [ws] = await tx<{ id: string }[]>`
      insert into client_workspaces (organization_id, name, client_name) values (${org!.id}, ${workspaceName}, ${input.clientName ?? null}) returning id`;
    await tx`insert into subscriptions (organization_id, plan_id, status, is_paid, trial_ends_at)
      values (${org!.id}, ${TRIAL_PLAN}, 'trialing', false, now() + make_interval(days => ${env().TRIAL_DAYS}))`;
    await tx`insert into notification_preferences (organization_id, user_id, workspace_id) values (${org!.id}, ${userId}, ${ws!.id})`;
    await audit(tx, { orgId: org!.id, actorId: userId, action: "organization.create", targetType: "organization", targetId: org!.id });
    return { orgId: org!.id, workspaceId: ws!.id };
  });
}

export interface Membership {
  organizationId: string;
  organizationName: string;
  role: "owner" | "member";
  isDemo: boolean;
}

export interface WorkspaceSummary {
  id: string;
  organizationId: string;
  name: string;
  clientName: string | null;
}

export async function listMemberships(userId: string): Promise<{ memberships: Membership[]; workspaces: WorkspaceSummary[] }> {
  return withUser(userId, async (tx) => {
    const memberships = await tx<Membership[]>`
      select m.organization_id, o.name as organization_name, m.role, o.is_demo
      from memberships m join organizations o on o.id = m.organization_id
      where m.user_id = ${userId} and o.deleted_at is null order by o.created_at`;
    const workspaces = await tx<WorkspaceSummary[]>`
      select id, organization_id, name, client_name from client_workspaces where archived_at is null order by created_at`;
    return { memberships, workspaces };
  });
}

export async function requestPasswordReset(emailInput: string): Promise<void> {
  const parsed = emailSchema.safeParse(emailInput);
  if (!parsed.success) return;
  const db = systemDb();
  const [user] = await db<{ id: string; email: string; isDemo: boolean }[]>`select id, email, is_demo from users where email = ${parsed.data}`;
  if (!user || user.isDemo) return; // same response either way (no enumeration)
  const token = randomToken();
  await db`insert into password_reset_tokens (user_id, token_hash, expires_at) values (${user.id}, ${sha256(token)}, now() + interval '1 hour')`;
  const link = `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    orgId: null,
    userId: user.id,
    to: user.email,
    template: "password_reset",
    subject: "Reset your RivalTide password",
    text: `Use this link within 1 hour to set a new password:\n${link}\n\nIf you did not request this, ignore this email.`,
    html: layout("Reset your password", `<p>Use the button below within 1 hour to set a new password.</p>
      <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#10B981;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Set a new password</a></p>
      <p style="color:#64748B;font-size:13px">If you did not request this, you can ignore this email.</p>`),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const password = passwordSchema.parse(newPassword);
  const db = systemDb();
  return db.begin(async (tx) => {
    const [row] = await tx<{ id: string; userId: string }[]>`
      update password_reset_tokens set used_at = now()
      where token_hash = ${sha256(token)} and used_at is null and expires_at > now() returning id, user_id`;
    if (!row) throw new AppError("This reset link is invalid or has expired.", "invalid");
    await tx`update users set password_hash = ${await hashPassword(password)} where id = ${row.userId}`;
    // Invalidate all existing sessions after a password change.
    await tx`delete from sessions where user_id = ${row.userId}`;
    await audit(tx, { orgId: null, actorId: row.userId, action: "user.password_reset" });
    return row.userId;
  });
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  const password = passwordSchema.parse(next);
  const db = systemDb();
  const [u] = await db<{ passwordHash: string }[]>`select password_hash from users where id = ${userId}`;
  if (!u || !(await verifyPassword(current, u.passwordHash))) throw new AppError("Current password is incorrect.", "invalid");
  await db`update users set password_hash = ${await hashPassword(password)} where id = ${userId}`;
}

/** Deletes the user's account. Organizations where they are the sole owner are deleted with all data. */
export async function deleteAccount(userId: string): Promise<void> {
  const db = systemDb();
  await db.begin(async (tx) => {
    const soleOwned = await tx<{ organizationId: string }[]>`
      select m.organization_id from memberships m where m.user_id = ${userId} and m.role = 'owner'
        and not exists (select 1 from memberships o where o.organization_id = m.organization_id and o.role = 'owner' and o.user_id <> ${userId})`;
    for (const o of soleOwned) await tx`delete from organizations where id = ${o.organizationId}`;
    await tx`delete from users where id = ${userId}`;
  });
}

export async function createSessionRecord(db: Db, userId: string, userAgent: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_DAYS * 86400_000);
  await db`insert into sessions (user_id, token_hash, expires_at, user_agent) values (${userId}, ${sha256(token)}, ${expiresAt}, ${userAgent?.slice(0, 300) ?? null})`;
  return { token, expiresAt };
}

export async function userForSessionToken(token: string): Promise<SessionUser | null> {
  const db = systemDb();
  const [row] = await db<(SessionUser & { sessionId: string; lastSeenAt: Date })[]>`
    select u.id, u.email, u.name, u.is_operator, u.is_demo, s.id as session_id, s.last_seen_at
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()`;
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 3600_000) {
    await db`update sessions set last_seen_at = now() where id = ${row.sessionId}`;
  }
  return { id: row.id, email: row.email, name: row.name, isOperator: row.isOperator, isDemo: row.isDemo };
}

export async function deleteSessionToken(token: string): Promise<void> {
  await systemDb()`delete from sessions where token_hash = ${sha256(token)}`;
}
