import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { runQueueOnce } from "@/server/monitoring/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fallback scheduler for hosts without a long-running worker (e.g. Vercel Cron).
 * Processes a small batch of static checks per invocation. The dedicated
 * worker is the recommended production setup (see DEPLOYMENT.md).
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await runQueueOnce(`cron-${process.pid}`, 5);
  return NextResponse.json({ processed: results.length, outcomes: results.map((r) => r.outcome) });
}
