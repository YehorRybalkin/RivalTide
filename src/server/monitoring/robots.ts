import robotsParser from "robots-parser";
import { systemDb } from "../db";
import { env } from "../env";
import { FetchFailure, safeFetch } from "./fetcher";

const CACHE_HOURS = 24;

export interface RobotsDecision {
  allowed: boolean;
  crawlDelaySeconds: number | null;
  reason: string | null;
  /** True when robots.txt could not be fetched for a transient reason; caller should retry later. */
  transient: boolean;
}

interface CachedRobots {
  robotsTxt: string | null;
  robotsStatus: number | null;
  robotsFetchedAt: Date | null;
}

/**
 * Applies RFC 9309 semantics:
 *  - 2xx: parse and obey rules for our token (falls back to "*")
 *  - 4xx (except 429): no restrictions
 *  - 5xx / network failure / 429: treat as fully disallowed for now
 */
export function decide(url: string, cached: { status: number | null; body: string | null }): RobotsDecision {
  const token = env().MONITOR_ROBOTS_TOKEN;
  const { status, body } = cached;
  if (status === null || status === 0 || status === 429 || status >= 500) {
    return { allowed: false, crawlDelaySeconds: null, reason: "robots.txt was unreachable; checking is paused until it can be read", transient: true };
  }
  if (status >= 400) return { allowed: true, crawlDelaySeconds: null, reason: null, transient: false };
  const origin = new URL(url).origin;
  const robots = robotsParser(`${origin}/robots.txt`, body ?? "");
  const allowed = robots.isAllowed(url, token) ?? true;
  const delay = robots.getCrawlDelay(token);
  return {
    allowed,
    crawlDelaySeconds: typeof delay === "number" && Number.isFinite(delay) ? Math.min(delay, 300) : null,
    reason: allowed ? null : "Blocked by the website's robots.txt",
    transient: false,
  };
}

export async function checkRobots(url: string): Promise<RobotsDecision> {
  const origin = new URL(url).origin;
  const db = systemDb();
  const [cached] = await db<CachedRobots[]>`select robots_txt, robots_status, robots_fetched_at from domain_state where host = ${origin}`;
  const fresh = cached?.robotsFetchedAt && Date.now() - cached.robotsFetchedAt.getTime() < CACHE_HOURS * 3600_000;
  if (cached && fresh) return decide(url, { status: cached.robotsStatus, body: cached.robotsTxt });

  let status = 0;
  let body: string | null = null;
  try {
    const res = await safeFetch(`${origin}/robots.txt`, { maxBytes: 500_000, accept: "text/plain,*/*;q=0.5", acceptedTypes: ["text/", "application/octet-stream"], timeoutMs: 10_000 });
    status = res.status;
    body = res.body;
  } catch (e) {
    if (e instanceof FetchFailure && e.status) {
      status = e.status;
    } else if (e instanceof FetchFailure && e.code === "unsupported_content") {
      status = 404; // robots.txt served as something else (e.g. an HTML 200): treat as absent
    } else if (e instanceof FetchFailure && e.code === "blocked_url") {
      return { allowed: false, crawlDelaySeconds: null, reason: e.message, transient: false };
    }
  }
  await db`insert into domain_state (host, robots_txt, robots_status, robots_fetched_at, updated_at)
    values (${origin}, ${body}, ${status}, now(), now())
    on conflict (host) do update set robots_txt = excluded.robots_txt, robots_status = excluded.robots_status,
      robots_fetched_at = excluded.robots_fetched_at, updated_at = now()`;
  return decide(url, { status, body });
}

/**
 * Per-origin politeness: atomically reserves the next request slot. Returns
 * null when the slot was reserved, or the time at which to retry.
 */
export async function reserveDomainSlot(url: string, crawlDelaySeconds: number | null): Promise<Date | null> {
  const origin = new URL(url).origin;
  const intervalMs = Math.max(env().MONITOR_DOMAIN_INTERVAL_MS, (crawlDelaySeconds ?? 0) * 1000);
  const db = systemDb();
  await db`insert into domain_state (host) values (${origin}) on conflict (host) do nothing`;
  const [reserved] = await db<{ host: string }[]>`
    update domain_state set next_allowed_at = now() + make_interval(secs => ${intervalMs / 1000}), updated_at = now()
    where host = ${origin} and next_allowed_at <= now() returning host`;
  if (reserved) return null;
  const [row] = await db<{ nextAllowedAt: Date }[]>`select next_allowed_at from domain_state where host = ${origin}`;
  return row?.nextAllowedAt ?? new Date(Date.now() + intervalMs);
}
