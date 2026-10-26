import { systemDb } from "../db";
import { env } from "../env";

/** Retention & cleanup. Snapshots referenced by changes (pinned) or as a page's latest are kept. */
export async function runMaintenance(): Promise<Record<string, number>> {
  const db = systemDb();
  const days = env().SNAPSHOT_RETENTION_DAYS;
  const snaps = await db`
    delete from snapshots s where not s.pinned and s.created_at < now() - make_interval(days => ${days})
      and not exists (select 1 from monitored_pages p where p.last_snapshot_id = s.id)
      and not exists (select 1 from detected_changes d where d.previous_snapshot_id = s.id or d.new_snapshot_id = s.id)
    returning s.id`;
  const attempts = await db`delete from monitoring_attempts where created_at < now() - make_interval(days => ${days}) returning id`;
  const jobs = await db`delete from monitoring_jobs where status in ('succeeded', 'cancelled', 'failed') and created_at < now() - interval '30 days' returning id`;
  const sessions = await db`delete from sessions where expires_at < now() returning id`;
  const resets = await db`delete from password_reset_tokens where expires_at < now() - interval '1 day' returning id`;
  const limits = await db`delete from rate_limits where window_start < now() - interval '1 day' returning key`;
  const demoUsers = await db`delete from users u where u.is_demo and not exists (
      select 1 from memberships m join organizations o on o.id = m.organization_id where m.user_id = u.id and (o.demo_expires_at is null or o.demo_expires_at > now()))
    returning id`;
  const demoOrgs = await db`delete from organizations where is_demo and demo_expires_at < now() returning id`;
  return { snapshots: snaps.length, attempts: attempts.length, jobs: jobs.length, sessions: sessions.length, resets: resets.length, rateLimits: limits.length, demoOrgs: demoOrgs.length, demoUsers: demoUsers.length };
}
