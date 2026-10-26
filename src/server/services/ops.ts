import { systemDb } from "../db";

/** Internal operator metrics (cost & reliability). System context; only shown to operators. */
export async function getOpsMetrics() {
  const db = systemDb();
  const [totals] = await db<{ orgs: number; users: number; activePages: number; queued: number; running: number; failedJobs24h: number; stuck: number }[]>`
    select (select count(*)::int from organizations where not is_demo) as orgs,
      (select count(*)::int from users where not is_demo) as users,
      (select count(*)::int from monitored_pages p join organizations o on o.id = p.organization_id where p.status = 'active' and not o.is_demo) as active_pages,
      (select count(*)::int from monitoring_jobs where status = 'queued') as queued,
      (select count(*)::int from monitoring_jobs where status = 'running') as running,
      (select count(*)::int from monitoring_jobs where status = 'failed' and finished_at > now() - interval '24 hours') as failed_jobs_24h,
      (select count(*)::int from monitoring_jobs where status = 'running' and locked_until < now()) as stuck`;
  const outcomes = await db<{ outcome: string; n: number }[]>`
    select outcome::text, count(*)::int as n from monitoring_attempts where created_at > now() - interval '7 days' group by 1 order by 2 desc`;
  const usage = await db<{ kind: string; quantity: number; cost: number }[]>`
    select kind, sum(quantity)::float as quantity, sum(estimated_cost_usd)::float as cost from usage_events
    where created_at > now() - interval '30 days' group by 1 order by 1`;
  const emails = await db<{ status: string; n: number }[]>`select status::text, count(*)::int as n from email_deliveries where created_at > now() - interval '30 days' group by 1`;
  const health = await db<{ health: string; n: number }[]>`
    select p.health::text, count(*)::int as n from monitored_pages p join organizations o on o.id = p.organization_id
    where p.status = 'active' and not o.is_demo group by 1`;
  const storage = await db<{ snapshots: number; bytes: number }[]>`select count(*)::int as snapshots, coalesce(sum(pg_column_size(content)), 0)::float as bytes from snapshots`;
  const recentFailures = await db<{ url: string; outcome: string; error: string | null; at: Date }[]>`
    select p.url, a.outcome::text, a.error_message as error, a.created_at as at from monitoring_attempts a join monitored_pages p on p.id = a.page_id
    where a.outcome not in ('changed', 'unchanged', 'baseline', 'not_modified') order by a.created_at desc limit 20`;
  return { totals: totals!, outcomes, usage, emails, health, storage: storage[0]!, recentFailures };
}
