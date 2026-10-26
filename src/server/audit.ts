import type { Db } from "./db";

export async function audit(db: Db, entry: { orgId: string | null; actorId: string | null; action: string; targetType?: string; targetId?: string | null; metadata?: Record<string, unknown> }) {
  await db`insert into audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
    values (${entry.orgId}, ${entry.actorId}, ${entry.action}, ${entry.targetType ?? null}, ${entry.targetId ?? null}, ${db.json((entry.metadata ?? {}) as never)})`;
}

export async function recordUsage(db: Db, orgId: string | null, kind: string, quantity = 1, estimatedCostUsd = 0, metadata: Record<string, unknown> = {}) {
  await db`insert into usage_events (organization_id, kind, quantity, estimated_cost_usd, metadata)
    values (${orgId}, ${kind}, ${quantity}, ${estimatedCostUsd}, ${db.json(metadata as never)})`;
}
