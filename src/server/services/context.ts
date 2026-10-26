import type { Tx } from "../db";
import { AppError } from "./errors";

export interface WorkspaceCtx {
  userId: string;
  orgId: string;
  workspaceId: string;
  role: "owner" | "member";
  orgName: string;
  workspaceName: string;
  isDemo: boolean;
}

/** Resolves a workspace for the current user. RLS guarantees non-members see nothing. */
export async function resolveWorkspace(tx: Tx, userId: string, workspaceId: string): Promise<WorkspaceCtx> {
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new AppError("Workspace not found", "not_found");
  const [row] = await tx<{ orgId: string; workspaceName: string; orgName: string; role: "owner" | "member"; isDemo: boolean }[]>`
    select w.organization_id as org_id, w.name as workspace_name, o.name as org_name, m.role, o.is_demo
    from client_workspaces w
    join organizations o on o.id = w.organization_id
    join memberships m on m.organization_id = w.organization_id and m.user_id = ${userId}
    where w.id = ${workspaceId} and w.archived_at is null and o.deleted_at is null`;
  if (!row) throw new AppError("Workspace not found", "not_found");
  return { userId, workspaceId, ...row };
}

export function requireOwner(ctx: { role: string }): void {
  if (ctx.role !== "owner") throw new AppError("Only organization owners can do this.", "forbidden");
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertUuid(id: string, what = "Record"): void {
  if (!UUID_RE.test(id)) throw new AppError(`${what} not found`, "not_found");
}
