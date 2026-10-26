import type { Db } from "../db";
import { systemDb } from "../db";

export interface JobRow {
  id: string;
  organizationId: string;
  pageId: string;
  trigger: "scheduled" | "manual" | "baseline";
  status: string;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
}

const LEASE_SECONDS = 300;

/**
 * Enqueues a check. Idempotent: the idempotency key collapses repeated
 * requests for the same slot, and a partial unique index guarantees at most
 * one queued/running job per page. Returns the job id (new or existing).
 */
export async function enqueuePageCheck(
  db: Db,
  args: { orgId: string; pageId: string; trigger: "scheduled" | "manual" | "baseline"; slot: string; runAfter?: Date },
): Promise<{ jobId: string; created: boolean }> {
  const key = `${args.pageId}:${args.trigger}:${args.slot}`;
  const inserted = await db<{ id: string }[]>`
    insert into monitoring_jobs (organization_id, page_id, trigger, idempotency_key, run_after)
    values (${args.orgId}, ${args.pageId}, ${args.trigger}, ${key}, ${args.runAfter ?? new Date()})
    on conflict do nothing returning id`;
  if (inserted[0]) return { jobId: inserted[0].id, created: true };
  const [existing] = await db<{ id: string }[]>`
    select id from monitoring_jobs
    where page_id = ${args.pageId} and (status in ('queued', 'running') or idempotency_key = ${key})
    order by created_at desc limit 1`;
  return { jobId: existing?.id ?? "", created: false };
}

/** Enqueues scheduled checks for pages that are due, belong to active orgs, and have no active job. */
export async function scheduleDuePages(limit = 200): Promise<number> {
  const db = systemDb();
  const due = await db<{ id: string; organizationId: string; nextCheckAt: Date }[]>`
    select p.id, p.organization_id, p.next_check_at
    from monitored_pages p
    join competitors c on c.id = p.competitor_id
    join organizations o on o.id = p.organization_id
    join subscriptions s on s.organization_id = o.id
    where p.status = 'active' and c.status = 'active' and o.deleted_at is null and not o.is_demo
      and p.next_check_at <= now()
      and (
        (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()))
        or (s.status = 'pilot' and (s.pilot_ends_at is null or s.pilot_ends_at > now()))
        or s.status in ('active', 'past_due')
      )
      and not exists (select 1 from monitoring_jobs j where j.page_id = p.id and j.status in ('queued', 'running'))
    order by p.next_check_at
    limit ${limit}`;
  let n = 0;
  for (const p of due) {
    const r = await enqueuePageCheck(db, { orgId: p.organizationId, pageId: p.id, trigger: "scheduled", slot: p.nextCheckAt.toISOString() });
    if (r.created) n++;
  }
  return n;
}

/** Atomically claims up to `n` runnable jobs (FOR UPDATE SKIP LOCKED) with a lease. */
export async function claimJobs(workerId: string, n: number, onlyJobId?: string): Promise<JobRow[]> {
  if (n <= 0) return [];
  const db = systemDb();
  return db<JobRow[]>`
    update monitoring_jobs j set status = 'running', locked_by = ${workerId},
      locked_until = now() + make_interval(secs => ${LEASE_SECONDS}), attempts = j.attempts + 1,
      started_at = coalesce(j.started_at, now())
    where j.id in (
      select id from monitoring_jobs
      where status = 'queued' and run_after <= now() ${onlyJobId ? db`and id = ${onlyJobId}` : db``}
      order by run_after
      limit ${n}
      for update skip locked
    )
    returning j.id, j.organization_id, j.page_id, j.trigger, j.status, j.attempts, j.max_attempts, j.run_after`;
}

export async function completeJob(jobId: string, workerId: string): Promise<void> {
  await systemDb()`update monitoring_jobs set status = 'succeeded', finished_at = now(), locked_by = null, locked_until = null
    where id = ${jobId} and locked_by = ${workerId}`;
}

/** Puts the job back in the queue without consuming an attempt (e.g. domain politeness delay). */
export async function deferJob(jobId: string, workerId: string, runAfter: Date): Promise<void> {
  await systemDb()`update monitoring_jobs set status = 'queued', run_after = ${runAfter}, attempts = greatest(attempts - 1, 0),
    locked_by = null, locked_until = null where id = ${jobId} and locked_by = ${workerId}`;
}

/** Retries with exponential backoff while attempts remain; otherwise marks failed. */
export async function failJob(job: JobRow, workerId: string, error: string, retryable: boolean): Promise<"retrying" | "failed"> {
  const db = systemDb();
  if (retryable && job.attempts < job.maxAttempts) {
    const backoffSec = Math.min(3600, 60 * 2 ** (job.attempts - 1)) + Math.floor(Math.random() * 30);
    await db`update monitoring_jobs set status = 'queued', last_error = ${error.slice(0, 1000)},
      run_after = now() + make_interval(secs => ${backoffSec}), locked_by = null, locked_until = null
      where id = ${job.id} and locked_by = ${workerId}`;
    return "retrying";
  }
  await db`update monitoring_jobs set status = 'failed', last_error = ${error.slice(0, 1000)}, finished_at = now(),
    locked_by = null, locked_until = null where id = ${job.id} and locked_by = ${workerId}`;
  return "failed";
}

export async function cancelJob(jobId: string, reason: string): Promise<void> {
  await systemDb()`update monitoring_jobs set status = 'cancelled', last_error = ${reason}, finished_at = now(),
    locked_by = null, locked_until = null where id = ${jobId}`;
}

/** Recovers jobs whose worker died mid-run (expired lease). */
export async function recoverStuckJobs(): Promise<number> {
  const db = systemDb();
  const requeued = await db`update monitoring_jobs set status = 'queued', locked_by = null, locked_until = null,
      last_error = 'Lease expired (worker stopped); requeued', run_after = now()
    where status = 'running' and locked_until < now() and attempts < max_attempts returning id`;
  const failed = await db`update monitoring_jobs set status = 'failed', locked_by = null, locked_until = null,
      last_error = 'Lease expired too many times', finished_at = now()
    where status = 'running' and locked_until < now() and attempts >= max_attempts returning id`;
  return requeued.length + failed.length;
}
