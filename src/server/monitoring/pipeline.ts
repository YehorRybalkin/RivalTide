import { systemDb } from "../db";
import { recordUsage } from "../audit";
import { contentHash, extractContent, visibleTextLength, type NormalizedContent } from "../detection/extract";
import { detectChange, looksDegraded, looksLikeChallengePage, type PageType } from "../detection/diff";
import { FetchFailure, safeFetch, type FetchResult } from "./fetcher";
import { renderPage } from "./render";
import { checkRobots, reserveDomainSlot } from "./robots";
import { cancelJob, completeJob, deferJob, failJob, type JobRow } from "./queue";
import { UnsafeUrlError, validateTargetUrl } from "./url-safety";
import { onChangeDetected } from "../services/change-events";

type Outcome =
  | "changed" | "unchanged" | "baseline" | "not_modified" | "http_error" | "timeout" | "network_error" | "blocked_robots"
  | "blocked_url" | "access_denied" | "too_large" | "unsupported_content" | "empty_content" | "render_error" | "rate_limited";

interface PageRow {
  id: string;
  organizationId: string;
  workspaceId: string;
  competitorId: string;
  url: string;
  pageType: PageType;
  renderMode: "static" | "browser";
  status: string;
  competitorStatus: string;
  checkIntervalHours: number;
  lastSnapshotId: string | null;
  httpEtag: string | null;
  httpLastModified: string | null;
  consecutiveFailures: number;
  isDemo: boolean;
}

export interface CheckResult {
  outcome: Outcome | "deferred" | "cancelled";
  changeId?: string;
  snapshotId?: string;
  message?: string;
}

const DEDUPE_DAYS = 30;

function failureOutcome(e: FetchFailure): Outcome {
  switch (e.code) {
    case "blocked_url": return "blocked_url";
    case "timeout": return "timeout";
    case "too_large": return "too_large";
    case "unsupported_content": return "unsupported_content";
    case "access_denied": return "access_denied";
    case "rate_limited": return "rate_limited";
    case "http_error":
    case "too_many_redirects": return "http_error";
    default: return "network_error";
  }
}

async function recordAttempt(page: PageRow, jobId: string | null, outcome: Outcome, info: { status?: number | null; finalUrl?: string | null; durationMs?: number; bytes?: number; error?: string | null }) {
  const [row] = await systemDb()<{ id: string }[]>`
    insert into monitoring_attempts (organization_id, job_id, page_id, outcome, http_status, final_url, render_mode, duration_ms, bytes, error_message)
    values (${page.organizationId}, ${jobId}, ${page.id}, ${outcome}, ${info.status ?? null}, ${info.finalUrl ?? null}, ${page.renderMode},
      ${info.durationMs ?? null}, ${info.bytes ?? null}, ${info.error?.slice(0, 1000) ?? null})
    returning id`;
  return row!.id;
}

async function markSuccess(page: PageRow, fields: { snapshotId?: string; etag?: string | null; lastModified?: string | null }) {
  const db = systemDb();
  await db`update monitored_pages set
      health = 'healthy', health_detail = null, consecutive_failures = 0,
      last_attempt_at = now(), last_success_at = now(),
      next_check_at = now() + make_interval(hours => ${page.checkIntervalHours}),
      last_snapshot_id = coalesce(${fields.snapshotId ?? null}::uuid, last_snapshot_id),
      snapshot_count = snapshot_count + ${fields.snapshotId ? 1 : 0},
      http_etag = coalesce(${fields.etag ?? null}, http_etag),
      http_last_modified = coalesce(${fields.lastModified ?? null}, http_last_modified)
    where id = ${page.id}`;
}

async function markFailure(page: PageRow, outcome: Outcome, detail: string, finalAttempt: boolean) {
  const restricted = outcome === "blocked_robots" || outcome === "access_denied" || outcome === "blocked_url";
  const failures = page.consecutiveFailures + 1;
  const health = restricted ? "restricted" : failures >= 3 ? "failed" : "delayed";
  // Only advance the schedule when no retry is pending, so retries stay within this cycle.
  await systemDb()`update monitored_pages set
      health = ${health}, health_detail = ${detail.slice(0, 500)}, consecutive_failures = ${failures}, last_attempt_at = now(),
      next_check_at = case when ${finalAttempt} then now() + make_interval(hours => ${page.checkIntervalHours}) else next_check_at end
    where id = ${page.id}`;
}

async function loadPage(pageId: string): Promise<PageRow | null> {
  const [row] = await systemDb()<PageRow[]>`
    select p.id, p.organization_id, p.workspace_id, p.competitor_id, p.url, p.page_type, p.render_mode, p.status,
      c.status as competitor_status, p.check_interval_hours, p.last_snapshot_id, p.http_etag, p.http_last_modified,
      p.consecutive_failures, o.is_demo
    from monitored_pages p
    join competitors c on c.id = p.competitor_id
    join organizations o on o.id = p.organization_id
    where p.id = ${pageId}`;
  return row ?? null;
}

async function fetchContent(page: PageRow, conditional: boolean): Promise<FetchResult> {
  if (page.renderMode === "browser") return renderPage(page.url);
  return safeFetch(page.url, conditional ? { etag: page.httpEtag, lastModified: page.httpLastModified } : {});
}

/**
 * Executes one monitoring job end to end. Failures are recorded as
 * monitoring health events; they never produce change records.
 */
export async function processJob(job: JobRow, workerId: string): Promise<CheckResult> {
  const db = systemDb();
  const page = await loadPage(job.pageId);
  if (!page || page.status !== "active" || page.competitorStatus !== "active" || page.isDemo) {
    await cancelJob(job.id, "Page is no longer actively monitored");
    return { outcome: "cancelled" };
  }

  // 1. Validate target (structure); DNS is validated at connect time.
  try {
    validateTargetUrl(page.url);
  } catch (e) {
    const msg = e instanceof UnsafeUrlError ? e.message : "Invalid URL";
    await recordAttempt(page, job.id, "blocked_url", { error: msg });
    await markFailure(page, "blocked_url", msg, true);
    await failJob(job, workerId, msg, false);
    return { outcome: "blocked_url", message: msg };
  }

  // 2. robots.txt
  const robots = await checkRobots(page.url);
  if (!robots.allowed) {
    const outcome: Outcome = robots.transient ? "network_error" : "blocked_robots";
    const msg = robots.reason ?? "Blocked by robots.txt";
    await recordAttempt(page, job.id, outcome, { error: msg });
    const final = !robots.transient || job.attempts >= job.maxAttempts;
    await markFailure(page, outcome, msg, final);
    await failJob(job, workerId, msg, robots.transient);
    return { outcome, message: msg };
  }

  // 3. Per-domain politeness slot
  const retryAt = await reserveDomainSlot(page.url, robots.crawlDelaySeconds);
  if (retryAt) {
    await deferJob(job.id, workerId, retryAt);
    return { outcome: "deferred" };
  }

  // 4. Fetch
  const [prevSnap] = page.lastSnapshotId
    ? await db<{ id: string; contentHash: string; content: NormalizedContent }[]>`select id, content_hash, content from snapshots where id = ${page.lastSnapshotId}`
    : [];
  let res: FetchResult;
  try {
    res = await fetchContent(page, Boolean(prevSnap));
    await recordUsage(db, page.organizationId, page.renderMode === "browser" ? "browser_render" : "fetch", 1, 0, { pageId: page.id, bytes: res.bytes });
  } catch (e) {
    const err = e instanceof FetchFailure ? e : new FetchFailure((e as Error).message, "network_error", undefined, true);
    const outcome = page.renderMode === "browser" && err.code === "network_error" ? "render_error" : failureOutcome(err);
    await recordAttempt(page, job.id, outcome, { status: err.status, finalUrl: err.finalUrl, error: err.message });
    await recordUsage(db, page.organizationId, "fetch_failed", 1, 0, { pageId: page.id, code: err.code });
    const final = !err.retryable || job.attempts >= job.maxAttempts;
    await markFailure(page, outcome, err.message, final);
    await failJob(job, workerId, err.message, err.retryable);
    return { outcome, message: err.message };
  }

  if (res.notModified && prevSnap) {
    await recordAttempt(page, job.id, "not_modified", { status: 304, finalUrl: res.finalUrl, durationMs: res.durationMs, bytes: 0 });
    await markSuccess(page, { etag: res.etag, lastModified: res.lastModified });
    await completeJob(job.id, workerId);
    return { outcome: "not_modified" };
  }

  // 5-6. Extract & normalize
  const content = extractContent(res.body, res.finalUrl);
  const textLen = visibleTextLength(content);
  if (looksLikeChallengePage(content)) {
    const msg = "The website served a bot-verification page. RivalTide does not bypass such protections.";
    await recordAttempt(page, job.id, "access_denied", { status: res.status, finalUrl: res.finalUrl, durationMs: res.durationMs, bytes: res.bytes, error: msg });
    await markFailure(page, "access_denied", msg, true);
    await failJob(job, workerId, msg, false);
    return { outcome: "access_denied", message: msg };
  }
  if (looksDegraded(prevSnap?.content ?? null, content, textLen)) {
    const msg = textLen < 40
      ? "Page returned almost no readable text (it may require JavaScript rendering)."
      : "Page content shrank drastically compared to the previous snapshot; treated as an extraction problem, not a change.";
    await recordAttempt(page, job.id, "empty_content", { status: res.status, finalUrl: res.finalUrl, durationMs: res.durationMs, bytes: res.bytes, error: msg });
    const final = job.attempts >= job.maxAttempts;
    await markFailure(page, "empty_content", msg, final);
    await failJob(job, workerId, msg, true);
    return { outcome: "empty_content", message: msg };
  }

  // 7. Unchanged? (hash over masked content)
  const hash = contentHash(content);
  if (prevSnap && prevSnap.contentHash === hash) {
    await recordAttempt(page, job.id, "unchanged", { status: res.status, finalUrl: res.finalUrl, durationMs: res.durationMs, bytes: res.bytes });
    await markSuccess(page, { etag: res.etag, lastModified: res.lastModified });
    await completeJob(job.id, workerId);
    return { outcome: "unchanged" };
  }

  // 8. Persist snapshot + compare, in one transaction.
  const result = await db.begin(async (tx) => {
    const outcome: Outcome = prevSnap ? "changed" : "baseline";
    const [attempt] = await tx<{ id: string }[]>`
      insert into monitoring_attempts (organization_id, job_id, page_id, outcome, http_status, final_url, render_mode, duration_ms, bytes)
      values (${page.organizationId}, ${job.id}, ${page.id}, ${outcome}, ${res.status}, ${res.finalUrl}, ${page.renderMode}, ${res.durationMs}, ${res.bytes})
      returning id`;
    const [snap] = await tx<{ id: string }[]>`
      insert into snapshots (organization_id, page_id, attempt_id, content_hash, content, text_length, final_url, http_status, extractor_version)
      values (${page.organizationId}, ${page.id}, ${attempt!.id}, ${hash}, ${tx.json(content as never)}, ${textLen}, ${res.finalUrl}, ${res.status}, ${content.v})
      returning id`;
    if (!prevSnap) return { outcome: "baseline" as const, snapshotId: snap!.id, attemptId: attempt!.id };

    const suppressedRows = await tx<{ patternHash: string }[]>`select pattern_hash from change_suppressions where page_id = ${page.id}`;
    const candidate = detectChange(prevSnap.content, content, { pageType: page.pageType, suppressed: new Set(suppressedRows.map((r) => r.patternHash)) });
    if (!candidate) {
      await tx`update monitoring_attempts set outcome = 'unchanged' where id = ${attempt!.id}`;
      return { outcome: "unchanged" as const, snapshotId: snap!.id, attemptId: attempt!.id };
    }
    // Deduplicate equivalent changes (e.g. rotating banners flipping back and forth).
    const [dup] = await tx<{ id: string }[]>`
      select id from detected_changes where page_id = ${page.id} and fingerprint = ${candidate.fingerprint}
        and detected_at > now() - make_interval(days => ${DEDUPE_DAYS}) limit 1`;
    if (dup) {
      await tx`update monitoring_attempts set outcome = 'unchanged', error_message = 'Equivalent to a recently detected change; deduplicated' where id = ${attempt!.id}`;
      return { outcome: "unchanged" as const, snapshotId: snap!.id, attemptId: attempt!.id };
    }
    const [change] = await tx<{ id: string }[]>`
      insert into detected_changes (organization_id, workspace_id, competitor_id, page_id, previous_snapshot_id, new_snapshot_id,
        source_url, category, severity, confidence, detection_method, summary, evidence, fingerprint, needs_review)
      values (${page.organizationId}, ${page.workspaceId}, ${page.competitorId}, ${page.id}, ${prevSnap.id}, ${snap!.id},
        ${res.finalUrl}, ${candidate.category}, ${candidate.severity}, ${candidate.confidence}, ${candidate.detectionMethod},
        ${candidate.summary}, ${tx.json(candidate.evidence as never)}, ${candidate.fingerprint}, ${candidate.needsReview})
      on conflict (page_id, previous_snapshot_id, new_snapshot_id) do nothing
      returning id`;
    // Evidence snapshots are retained for the audit trail.
    await tx`update snapshots set pinned = true where id in (${prevSnap.id}, ${snap!.id})`;
    return { outcome: "changed" as const, snapshotId: snap!.id, attemptId: attempt!.id, changeId: change?.id };
  });

  await markSuccess(page, { snapshotId: result.snapshotId, etag: res.etag, lastModified: res.lastModified });
  await completeJob(job.id, workerId);

  if (result.outcome === "changed" && "changeId" in result && result.changeId) {
    // Post-processing (alerts, insights) must never fail the monitoring job.
    await onChangeDetected(result.changeId).catch((e) => console.error("[pipeline] post-processing failed", (e as Error).message));
    return { outcome: "changed", changeId: result.changeId, snapshotId: result.snapshotId };
  }
  return { outcome: result.outcome, snapshotId: result.snapshotId };
}
