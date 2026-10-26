"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withUser } from "@/server/db";
import { inWorkspace } from "@/server/workspace";
import { requireUser } from "@/server/auth/session";
import { safeAction, type ActionState } from "@/server/actions";
import { rateLimit } from "@/server/rate-limit";
import { discoverPages } from "@/server/services/discovery";
import { addPages, createCompetitor, setCompetitorStatus, setPageStatus, updateCompetitor, PAGE_TYPES } from "@/server/services/competitors";
import { enqueueManualCheck, runJobInline } from "@/server/monitoring/runner";
import { giveFeedback, markAllRead, setReviewStatus } from "@/server/services/changes";
import { authorizeRegenerate, toggleSaveInsight } from "@/server/services/insights-query";
import { generateInsightForChange } from "@/server/services/insights";
import { deleteReport, finalizeReport, generateReport } from "@/server/services/reports";
import { addCriterion, deleteCriterion, setCriterionValue } from "@/server/services/compare";
import { AppError } from "@/server/services/errors";
import { assertUuid } from "@/server/services/context";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const wsOf = (f: FormData) => {
  const ws = str(f, "ws");
  assertUuid(ws, "Workspace");
  return ws;
};

/** Validates a URL, reads metadata where permitted and suggests pages. Never crawls beyond the homepage. */
export async function discoverAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!(await rateLimit(`discover:${user.id}`, 20, 3600))) return { error: "Too many lookups. Please wait a few minutes." };
  return safeAction(async () => {
    await inWorkspace(wsOf(form), async () => undefined); // membership check
    const result = await discoverPages(str(form, "url"));
    return { ok: true, data: result };
  });
}

const selectedPage = z.object({ url: z.string(), pageType: z.enum(PAGE_TYPES), label: z.string().optional() });

export async function createCompetitorAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  let competitorId = "";
  let jobIds: string[] = [];
  const res = await safeAction(async () => {
    const pages = z.array(selectedPage).max(20).parse(JSON.parse(str(form, "pages") || "[]"));
    const r = await inWorkspace(ws, async (tx, ctx) => {
      const id = await createCompetitor(tx, ctx, {
        name: str(form, "name"), websiteUrl: str(form, "websiteUrl"), description: str(form, "description"),
        category: str(form, "category"), industry: str(form, "industry"), notes: str(form, "notes"),
      });
      const pageIds = pages.length ? await addPages(tx, ctx, id, pages.map((p) => ({ url: p.url, pageType: p.pageType, label: p.label }))) : [];
      const jobs: string[] = [];
      for (const pageId of pageIds) jobs.push(await enqueueManualCheck(tx, { orgId: ctx.orgId, pageId, trigger: "baseline" }));
      return { id, jobs };
    });
    competitorId = r.id;
    jobIds = r.jobs;
  });
  if (res.error) return res;
  // Run first baseline fetches now (bounded); anything not finished is picked up by the worker.
  const deadline = Date.now() + 25_000;
  for (const jobId of jobIds) {
    if (Date.now() > deadline) break;
    await runJobInline(jobId).catch((e) => console.error("[baseline] inline run failed", (e as Error).message));
  }
  revalidatePath(`/app/${ws}`, "layout");
  redirect(`/app/${ws}/competitors/${competitorId}?created=1${str(form, "onboarding") ? "&onboarding=1" : ""}`);
}

export async function updateCompetitorAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  const res = await safeAction(async () => {
    await inWorkspace(ws, (tx, ctx) => updateCompetitor(tx, ctx, str(form, "competitorId"), {
      name: str(form, "name"), websiteUrl: str(form, "websiteUrl"), description: str(form, "description"),
      category: str(form, "category"), industry: str(form, "industry"), notes: str(form, "notes"),
    }));
    return { ok: true, message: "Competitor updated." };
  });
  revalidatePath(`/app/${ws}/competitors/${str(form, "competitorId")}`);
  return res;
}

export async function competitorStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  const status = z.enum(["active", "paused", "archived"]).parse(str(form, "status"));
  const res = await safeAction(async () => {
    await inWorkspace(ws, (tx, ctx) => setCompetitorStatus(tx, ctx, str(form, "competitorId"), status));
    return { ok: true, message: status === "active" ? "Monitoring resumed." : status === "paused" ? "Monitoring paused." : "Competitor archived." };
  });
  revalidatePath(`/app/${ws}`, "layout");
  return res;
}

export async function addPageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  let jobId = "";
  const res = await safeAction(async () => {
    jobId = await inWorkspace(ws, async (tx, ctx) => {
      const ids = await addPages(tx, ctx, str(form, "competitorId"), [{
        url: str(form, "url"),
        pageType: (str(form, "pageType") || undefined) as (typeof PAGE_TYPES)[number] | undefined,
        label: str(form, "label"),
        renderMode: str(form, "renderMode") === "browser" ? "browser" : "static",
      }]);
      if (!ids[0]) throw new AppError("This page is already monitored.", "conflict");
      return enqueueManualCheck(tx, { orgId: ctx.orgId, pageId: ids[0], trigger: "baseline" });
    });
  });
  if (res.error) return res;
  const result = await runJobInline(jobId).catch(() => null);
  revalidatePath(`/app/${ws}`, "layout");
  return { ok: true, message: result ? `Page added. First check: ${outcomeLabel(result.outcome)}.` : "Page added. The baseline check is queued." };
}

export async function pageStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  const status = z.enum(["active", "paused", "removed"]).parse(str(form, "status"));
  const res = await safeAction(async () => {
    await inWorkspace(ws, (tx, ctx) => setPageStatus(tx, ctx, str(form, "pageId"), status));
    return { ok: true, message: status === "removed" ? "Page removed from monitoring." : status === "paused" ? "Page paused." : "Page resumed." };
  });
  revalidatePath(`/app/${ws}`, "layout");
  return res;
}

function outcomeLabel(o: string): string {
  return ({
    baseline: "baseline snapshot saved", unchanged: "no changes", changed: "change detected", not_modified: "not modified since last check",
    blocked_robots: "blocked by robots.txt", access_denied: "access restricted", http_error: "the website returned an error",
    timeout: "timed out", network_error: "network error", empty_content: "no readable content", unsupported_content: "unsupported content type",
    blocked_url: "address not allowed", too_large: "page too large", rate_limited: "rate limited by the website", deferred: "queued (politeness delay)",
    cancelled: "cancelled", render_error: "rendering failed",
  } as Record<string, string>)[o] ?? o;
}

export async function checkNowAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  const pageId = str(form, "pageId");
  const user = await requireUser();
  if (!(await rateLimit(`check:page:${pageId}`, 1, 600))) return { error: "This page was checked recently. Manual checks are limited to one every 10 minutes per page." };
  if (!(await rateLimit(`check:user:${user.id}`, 30, 3600))) return { error: "Manual check limit reached. Scheduled checks continue as normal." };
  let jobId = "";
  const res = await safeAction(async () => {
    assertUuid(pageId, "Page");
    jobId = await inWorkspace(ws, async (tx, ctx) => {
      if (ctx.isDemo) throw new AppError("The demo workspace is read-only; its pages are fictional and are never fetched.", "forbidden");
      const [p] = await tx<{ status: string }[]>`select status from monitored_pages where id = ${pageId} and workspace_id = ${ctx.workspaceId}`;
      if (!p) throw new AppError("Page not found", "not_found");
      if (p.status !== "active") throw new AppError("Resume this page before checking it.", "invalid");
      return enqueueManualCheck(tx, { orgId: ctx.orgId, pageId, trigger: "manual" });
    });
  });
  if (res.error) return res;
  const result = await runJobInline(jobId).catch(() => null);
  revalidatePath(`/app/${ws}`, "layout");
  if (!result) return { ok: true, message: "Check queued. The worker will run it shortly." };
  const failed = !["baseline", "unchanged", "changed", "not_modified", "deferred"].includes(result.outcome);
  return failed ? { error: `Check finished: ${outcomeLabel(result.outcome)}.${result.message ? ` ${result.message}` : ""}` } : { ok: true, message: `Check finished: ${outcomeLabel(result.outcome)}.` };
}

export async function reviewChangeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  const status = z.enum(["new", "reviewed", "dismissed"]).parse(str(form, "status"));
  const res = await safeAction(async () => {
    await inWorkspace(ws, (tx, ctx) => setReviewStatus(tx, ctx, str(form, "changeId"), status));
    return { ok: true, message: status === "dismissed" ? "Change dismissed." : status === "reviewed" ? "Marked as reviewed." : "Marked as new." };
  });
  revalidatePath(`/app/${ws}`, "layout");
  return res;
}

export async function feedbackAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  const fb = z.enum(["relevant", "irrelevant", "incorrect"]).parse(str(form, "feedback"));
  const res = await safeAction(async () => {
    await inWorkspace(ws, (tx, ctx) => giveFeedback(tx, ctx, str(form, "changeId"), fb));
    return { ok: true, message: fb === "relevant" ? "Thanks — marked as relevant." : "Thanks — similar content on this page will be ignored in future checks." };
  });
  revalidatePath(`/app/${ws}`, "layout");
  return res;
}

export async function markAllReadAction(form: FormData): Promise<void> {
  const ws = wsOf(form);
  await inWorkspace(ws, (tx, ctx) => markAllRead(tx, ctx));
  revalidatePath(`/app/${ws}`, "layout");
}

export async function regenerateInsightAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  const changeId = str(form, "changeId");
  const user = await requireUser();
  if (!(await rateLimit(`regen:${user.id}`, 20, 3600))) return { error: "Too many analysis requests. Try again later." };
  const res = await safeAction(async () => {
    await inWorkspace(ws, (tx, ctx) => authorizeRegenerate(tx, ctx, changeId));
    await generateInsightForChange(changeId);
    return { ok: true, message: "Analysis updated." };
  });
  revalidatePath(`/app/${ws}/changes/${changeId}`);
  return res;
}

export async function saveInsightAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  const saved = str(form, "saved") === "true";
  const res = await safeAction(async () => {
    await inWorkspace(ws, (tx, ctx) => toggleSaveInsight(tx, ctx, str(form, "insightId"), saved));
    return { ok: true, message: saved ? "Saved for reports." : "Removed from reports." };
  });
  revalidatePath(`/app/${ws}`, "layout");
  return res;
}

export async function generateReportAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  let id = "";
  const res = await safeAction(async () => {
    id = await inWorkspace(ws, (tx, ctx) => generateReport(tx, ctx, {
      type: str(form, "type") as "weekly_brief", periodDays: Number(str(form, "periodDays") || 7), competitorId: str(form, "competitorId") || undefined, title: str(form, "title"),
    }));
  });
  if (res.error) return res;
  revalidatePath(`/app/${ws}/reports`);
  redirect(`/app/${ws}/reports/${id}`);
}

export async function finalizeReportAction(form: FormData): Promise<void> {
  const ws = wsOf(form);
  await inWorkspace(ws, (tx, ctx) => finalizeReport(tx, ctx, str(form, "reportId")));
  revalidatePath(`/app/${ws}/reports`, "layout");
}

export async function deleteReportAction(form: FormData): Promise<void> {
  const ws = wsOf(form);
  await inWorkspace(ws, (tx, ctx) => deleteReport(tx, ctx, str(form, "reportId")));
  revalidatePath(`/app/${ws}/reports`);
  redirect(`/app/${ws}/reports`);
}

export async function addCriterionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  const res = await safeAction(async () => {
    await inWorkspace(ws, (tx, ctx) => addCriterion(tx, ctx, { name: str(form, "name"), description: str(form, "description") }));
    return { ok: true, message: "Criterion added." };
  });
  revalidatePath(`/app/${ws}/compare`);
  return res;
}

export async function deleteCriterionAction(form: FormData): Promise<void> {
  const ws = wsOf(form);
  await inWorkspace(ws, (tx, ctx) => deleteCriterion(tx, ctx, str(form, "criterionId")));
  revalidatePath(`/app/${ws}/compare`);
}

export async function setCriterionValueAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ws = wsOf(form);
  const res = await safeAction(async () => {
    await inWorkspace(ws, (tx, ctx) => setCriterionValue(tx, ctx, {
      criterionId: str(form, "criterionId"), competitorId: str(form, "competitorId"), value: str(form, "value"),
      source: str(form, "source") as "competitor_claim", evidenceUrl: str(form, "evidenceUrl"),
    }));
    return { ok: true, message: "Saved." };
  });
  revalidatePath(`/app/${ws}/compare`);
  return res;
}

export async function markAlertsReadAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const ids = form.getAll("alertId").map(String).filter(Boolean);
  await withUser(user.id, (tx) => import("@/server/services/organization").then((m) => m.markAlertsRead(tx, user.id, ids.length ? ids : undefined)));
  revalidatePath(`/app/${wsOf(form)}`, "layout");
}
