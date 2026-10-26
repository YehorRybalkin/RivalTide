import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { systemDb } from "../db";
import { env } from "../env";
import { createSessionRecord, deleteSessionToken, userForSessionToken, type SessionUser } from "../services/accounts";

export async function startSession(userId: string): Promise<void> {
  const ua = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSessionRecord(systemDb(), userId, ua);
  (await cookies()).set(env().SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(env().SESSION_COOKIE_NAME)?.value;
  if (token) await deleteSessionToken(token);
  jar.delete(env().SESSION_COOKIE_NAME);
}

/** Current user for this request (memoized per request). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(env().SESSION_COOKIE_NAME)?.value;
  if (!token || token.length > 200) return null;
  return userForSessionToken(token);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}
