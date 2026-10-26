import { systemDb } from "./db";

/**
 * Fixed-window rate limiter backed by Postgres (works across serverless
 * instances without extra infrastructure). Returns true when allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = systemDb();
  const [row] = await db<{ count: number }[]>`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count`;
  return (row?.count ?? 0) <= limit;
}
