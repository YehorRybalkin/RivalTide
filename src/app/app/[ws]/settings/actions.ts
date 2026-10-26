"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withUser } from "@/server/db";
import { inWorkspace } from "@/server/workspace";
import { endSession, requireUser } from "@/server/auth/session";
import { safeAction, type ActionState } from "@/server/actions";
import { changePassword, deleteAccount } from "@/server/services/accounts";
import {
  archiveWorkspace, createWorkspace, deleteOrganization, inviteMember, removeMember, renameOrganization, revokeInvitation,
  setNotificationPrefs, updateWorkspace,
} from "@/server/services/organization";
import { createCheckoutSession, createPortalSession } from "@/server/billing/stripe";
import { isPlanId } from "@/server/billing/plans";
import { AppError } from "@/server/services/errors";
import { rateLimit } from "@/server/rate-limit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function updateProfileAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  return safeAction(async () => {
    const name = z.string().trim().min(1, "Name is required").max(120).parse(str(form, "name"));
    await withUser(user.id, (tx) => tx`update users set name = ${name} where id = ${user.id}`);
    revalidatePath("/app", "layout");
    return { ok: true, message: "Profile updated." };
  });
}

export async function changePasswordAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.isDemo) return { error: "Demo accounts cannot set a password." };
  if (!(await rateLimit(`pwchange:${user.id}`, 5, 3600))) return { error: "Too many attempts. Try again later." };
  if (str(form, "next") !== str(form, "confirm")) return { error: "New passwords do not match." };
  return safeAction(async () => {
    await changePassword(user.id, str(form, "current"), str(form, "next"));
    return { ok: true, message: "Password changed." };
  });
}

export async function renameOrgAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const res = await safeAction(async () => {
    await inWorkspace(str(form, "ws"), (tx, ctx) => renameOrganization(tx, ctx, str(form, "name")));
    return { ok: true, message: "Organization renamed." };
  });
  revalidatePath("/app", "layout");
  return res;
}

export async function inviteAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!(await rateLimit(`invite:${user.id}`, 20, 3600))) return { error: "Too many invitations. Try again later." };
  const res = await safeAction(async () => {
    const role = str(form, "role") === "owner" ? "owner" : "member";
    const r = await inWorkspace(str(form, "ws"), (tx, ctx) => inviteMember(tx, ctx, str(form, "email"), role));
    return r.emailStatus === "sent"
      ? { ok: true, message: "Invitation sent." }
      : { ok: true, message: "Invitation created. Email is not configured — share this link manually (valid 7 days).", data: { link: r.link } };
  });
  revalidatePath(`/app/${str(form, "ws")}/settings/organization`);
  return res;
}

export async function revokeInviteAction(form: FormData): Promise<void> {
  await inWorkspace(str(form, "ws"), (tx, ctx) => revokeInvitation(tx, ctx, str(form, "invitationId")));
  revalidatePath(`/app/${str(form, "ws")}/settings/organization`);
}

export async function removeMemberAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const res = await safeAction(async () => {
    await inWorkspace(str(form, "ws"), (tx, ctx) => removeMember(tx, ctx, str(form, "userId")));
    return { ok: true, message: "Member removed." };
  });
  revalidatePath(`/app/${str(form, "ws")}/settings/organization`);
  return res;
}

export async function createWorkspaceAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const res = await safeAction(async () => {
    const ctx = await inWorkspace(str(form, "ws"), async (_tx, c) => c);
    id = await withUser(user.id, (tx) => createWorkspace(tx, user.id, ctx.orgId, {
      name: str(form, "name"), clientName: str(form, "clientName"), description: str(form, "description"), brandName: str(form, "brandName"), brandColor: str(form, "brandColor"),
    }));
  });
  if (res.error) return res;
  revalidatePath("/app", "layout");
  redirect(`/app/${id}/competitors/new`);
}

export async function updateWorkspaceAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const res = await safeAction(async () => {
    await inWorkspace(str(form, "ws"), (tx, ctx) => updateWorkspace(tx, ctx, {
      name: str(form, "name"), clientName: str(form, "clientName"), description: str(form, "description"), brandName: str(form, "brandName"),
      brandColor: str(form, "brandColor"), defaultCheckIntervalHours: Number(str(form, "interval") || 24),
    }));
    return { ok: true, message: "Workspace updated." };
  });
  revalidatePath("/app", "layout");
  return res;
}

export async function archiveWorkspaceAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const res = await safeAction(async () => {
    await inWorkspace(str(form, "ws"), (tx, ctx) => archiveWorkspace(tx, ctx));
  });
  if (res.error) return res;
  redirect("/app");
}

export async function notificationPrefsAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const res = await safeAction(async () => {
    await inWorkspace(str(form, "ws"), (tx, ctx) => setNotificationPrefs(tx, ctx, {
      mode: str(form, "mode") as "all", emailEnabled: form.get("emailEnabled") === "on", digest: str(form, "digest") as "weekly",
    }));
    return { ok: true, message: "Notification preferences saved." };
  });
  return res;
}

export async function checkoutAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let url = "";
  const res = await safeAction(async () => {
    const plan = str(form, "plan");
    if (!isPlanId(plan) || plan === "demo") throw new AppError("Unknown plan", "invalid");
    url = await inWorkspace(str(form, "ws"), (tx, ctx) => createCheckoutSession(tx, ctx, plan, user.email));
  });
  if (res.error) return res;
  redirect(url);
}

export async function portalAction(_p: ActionState, form: FormData): Promise<ActionState> {
  let url = "";
  const res = await safeAction(async () => {
    url = await inWorkspace(str(form, "ws"), (tx, ctx) => createPortalSession(tx, ctx));
  });
  if (res.error) return res;
  redirect(url);
}

export async function deleteAccountAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (str(form, "confirm") !== "DELETE") return { error: "Type DELETE to confirm." };
  await deleteAccount(user.id);
  await endSession().catch(() => {});
  redirect("/?deleted=1");
}

export async function deleteOrgAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const ctx = await inWorkspace(str(form, "ws"), async (_tx, c) => c);
  if (str(form, "confirm") !== ctx.orgName) return { error: "Type the organization name exactly to confirm." };
  const res = await safeAction(async () => {
    await deleteOrganization(user.id, ctx.orgId);
  });
  if (res.error) return res;
  redirect("/app");
}
