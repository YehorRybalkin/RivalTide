"use server";
import { redirect } from "next/navigation";
import { rateLimit } from "@/server/rate-limit";
import { clientIp, endSession, getSessionUser, startSession } from "@/server/auth/session";
import { authenticate, requestPasswordReset, resetPassword, signUp } from "@/server/services/accounts";
import { acceptInvitation } from "@/server/services/organization";
import { createDemoAccount } from "@/server/demo/seed";
import { safeAction, type ActionState } from "@/server/actions";

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/app";
}

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = await clientIp();
  const email = String(form.get("email") ?? "");
  if (!(await rateLimit(`login:ip:${ip}`, 20, 900)) || !(await rateLimit(`login:email:${email.toLowerCase()}`, 8, 900))) {
    return { error: "Too many sign-in attempts. Please wait a few minutes." };
  }
  const user = await authenticate(email, String(form.get("password") ?? ""));
  if (!user) return { error: "Incorrect email or password." };
  await startSession(user.id);
  redirect(safeNext(form.get("next")));
}

export async function signupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!(await rateLimit(`signup:ip:${ip}`, 10, 3600))) return { error: "Too many sign-ups from this network. Try again later." };
  if (form.get("terms") !== "on") return { error: "Please accept the terms to continue.", fieldErrors: { terms: "Required" } };
  const res = await safeAction(async () => {
    const user = await signUp({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), name: String(form.get("name") ?? "") });
    await startSession(user.id);
  });
  if (res.error) return res;
  redirect(safeNext(form.get("next")) === "/app" ? "/onboarding" : safeNext(form.get("next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!(await rateLimit(`reset:ip:${ip}`, 5, 3600))) return { error: "Too many requests. Try again later." };
  await requestPasswordReset(String(form.get("email") ?? ""));
  return { ok: true, message: "If an account exists for that address, we've sent a password reset link. It expires in 1 hour." };
}

export async function resetPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "Passwords do not match." };
  const res = await safeAction(async () => {
    await resetPassword(String(form.get("token") ?? ""), password);
  });
  if (res.error) return res;
  redirect("/login?reset=1");
}

export async function acceptInviteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/invite/${encodeURIComponent(String(form.get("token") ?? ""))}`);
  const res = await safeAction(async () => {
    await acceptInvitation(user.id, user.email, String(form.get("token") ?? ""));
  });
  if (res.error) return res;
  redirect("/app");
}

export async function startDemoAction(): Promise<void> {
  const ip = await clientIp();
  if (!(await rateLimit(`demo:ip:${ip}`, 6, 3600))) redirect("/?demo=rate-limited");
  const current = await getSessionUser();
  if (current && !current.isDemo) {
    // Keep the real session; the demo opens in a separate account only after signing out.
    redirect("/app?demo=signed-in");
  }
  const { userId, workspaceId } = await createDemoAccount();
  await startSession(userId);
  redirect(`/app/${workspaceId}`);
}
