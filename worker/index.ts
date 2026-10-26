/**
 * RivalTide background worker.
 *   npm run worker        — long-running loop (scheduler + job processor + periodic tasks)
 *   npm run worker:once   — process everything currently due, then exit (cron-style deployments)
 */
import { hostname } from "node:os";
import { loadEnvFile } from "../scripts/load-env";

loadEnvFile();

const { env } = await import("../src/server/env");
const { closeDb, systemDb } = await import("../src/server/db");
const { claimJobs, recoverStuckJobs, scheduleDuePages } = await import("../src/server/monitoring/queue");
const { processJob } = await import("../src/server/monitoring/pipeline");
const { closeBrowser } = await import("../src/server/monitoring/render");
const { runMaintenance } = await import("../src/server/monitoring/maintenance");
const { sendDueDigests } = await import("../src/server/services/alerts");
const { detectThemes } = await import("../src/server/services/insights");

const cfg = env();
const workerId = `${hostname()}-${process.pid}`;
const once = process.argv.includes("--once");
let stopping = false;
const inflight = new Set<Promise<unknown>>();

function log(msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: workerId, msg, ...extra }));
}

const periodic: { name: string; everyMs: number; last: number; run: () => Promise<unknown> }[] = [
  { name: "digests", everyMs: 15 * 60_000, last: 0, run: sendDueDigests },
  {
    name: "themes",
    everyMs: 6 * 3600_000,
    last: 0,
    run: async () => {
      const ws = await systemDb()<{ id: string }[]>`select id from client_workspaces where archived_at is null`;
      let n = 0;
      for (const w of ws) n += await detectThemes(w.id);
      return n;
    },
  },
  { name: "maintenance", everyMs: 24 * 3600_000, last: 0, run: runMaintenance },
];

async function tick(): Promise<number> {
  await recoverStuckJobs();
  const scheduled = await scheduleDuePages();
  if (scheduled) log("scheduled", { count: scheduled });
  const capacity = cfg.WORKER_CONCURRENCY - inflight.size;
  const jobs = await claimJobs(workerId, capacity);
  for (const job of jobs) {
    const p = processJob(job, workerId)
      .then((r) => log("job", { job: job.id, page: job.pageId, outcome: r.outcome, message: r.message }))
      .catch((e) => log("job_error", { job: job.id, error: (e as Error).message }))
      .finally(() => inflight.delete(p));
    inflight.add(p);
  }
  for (const task of periodic) {
    if (Date.now() - task.last >= task.everyMs) {
      task.last = Date.now();
      try {
        const out = await task.run();
        log(`periodic:${task.name}`, { result: out as never });
      } catch (e) {
        log(`periodic:${task.name}:error`, { error: (e as Error).message });
      }
    }
  }
  return jobs.length;
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("shutting down", { signal, inflight: inflight.size });
  await Promise.allSettled([...inflight]);
  await closeBrowser();
  await closeDb();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

log("worker started", { concurrency: cfg.WORKER_CONCURRENCY, once, browser: cfg.MONITOR_BROWSER_ENABLED });

if (once) {
  for (;;) {
    const claimed = await tick();
    await Promise.allSettled([...inflight]);
    if (claimed === 0) break;
  }
  await shutdown("once-complete");
} else {
  while (!stopping) {
    try {
      const claimed = await tick();
      if (claimed === 0) await new Promise((r) => setTimeout(r, cfg.WORKER_POLL_MS));
      else await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      log("tick_error", { error: (e as Error).message });
      await new Promise((r) => setTimeout(r, cfg.WORKER_POLL_MS));
    }
  }
}
