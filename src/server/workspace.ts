import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { withUser, type Tx } from "./db";
import { requireUser } from "./auth/session";
import { resolveWorkspace, type WorkspaceCtx } from "./services/context";
import { AppError } from "./services/errors";
import type { SessionUser } from "./services/accounts";

/** Resolves the workspace in the URL for the signed-in user, or 404s. */
export const loadWorkspace = cache(async (workspaceId: string): Promise<{ user: SessionUser; ctx: WorkspaceCtx }> => {
  const user = await requireUser();
  try {
    const ctx = await withUser(user.id, (tx) => resolveWorkspace(tx, user.id, workspaceId));
    return { user, ctx };
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
});

/** Runs a tenant-scoped query for the workspace in the URL. */
export async function inWorkspace<T>(workspaceId: string, fn: (tx: Tx, ctx: WorkspaceCtx, user: SessionUser) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return withUser(user.id, async (tx) => {
    const ctx = await resolveWorkspace(tx, user.id, workspaceId);
    return fn(tx, ctx, user);
  });
}
