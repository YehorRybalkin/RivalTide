import { claimJobs, enqueuePageCheck, recoverStuckJobs, scheduleDuePages } from "./queue";
import { processJob, type CheckResult } from "./pipeline";
import { systemDb, type Db } from "../db";

/** Runs up to `limit` queued jobs once. Used by the worker loop, the cron endpoint and tests. */
export async function runQueueOnce(workerId: string, limit: number): Promise<CheckResult[]> {
  await recoverStuckJobs();
  await scheduleDuePages();
  const jobs = await claimJobs(workerId, limit);
  const results = await Promise.allSettled(jobs.map((j) => processJob(j, workerId)));
  return results.map((r) => (r.status === "fulfilled" ? r.value : { outcome: "network_error" as const, message: String(r.reason) }));
}

/** Enqueues a manual/baseline check inside the caller's (RLS) transaction. */
export async function enqueueManualCheck(db: Db, args: { orgId: string; pageId: string; trigger: "manual" | "baseline" }): Promise<string> {
  const slot = new Date().toISOString().slice(0, 16); // collapses repeated clicks within a minute
  const { jobId } = await enqueuePageCheck(db, { ...args, slot });
  return jobId;
}

/**
 * Runs a queued job immediately on the web server (static fetches only),
 * after the enqueuing transaction has committed. Claiming uses the same lock
 * as the worker, so a job can never run twice concurrently.
 */
export async function runJobInline(jobId: string): Promise<CheckResult | null> {
  if (!jobId) return null;
  const [row] = await systemDb()<{ renderMode: string }[]>`
    select p.render_mode from monitoring_jobs j join monitored_pages p on p.id = j.page_id where j.id = ${jobId}`;
  if (row?.renderMode !== "static") return null;
  const workerId = `web-${process.pid}`;
  const [job] = await claimJobs(workerId, 1, jobId);
  if (!job) return null;
  return processJob(job, workerId);
}
