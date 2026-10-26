import type { Db } from "../db";
import { PLANS, TRIAL_AI_ANALYSES, isPlanId, type Entitlements, type PlanId } from "./plans";

export type SubscriptionStatus = "trialing" | "pilot" | "active" | "past_due" | "canceled" | "expired" | "none";

export interface OrgEntitlements {
  planId: PlanId;
  planName: string;
  status: SubscriptionStatus;
  /** Whether the org may monitor and create content right now. */
  active: boolean;
  isPaid: boolean;
  endsAt: Date | null;
  limits: Entitlements;
  statusLabel: string;
}

export interface Usage {
  competitors: number;
  pages: number;
  workspaces: number;
  seats: number;
  aiAnalysesThisMonth: number;
  reportsThisMonth: number;
}

export class EntitlementError extends Error {
  constructor(message: string, public readonly code: "limit" | "inactive" | "feature") {
    super(message);
    this.name = "EntitlementError";
  }
}

export async function getEntitlements(db: Db, orgId: string): Promise<OrgEntitlements> {
  const [sub] = await db<{ planId: string; status: SubscriptionStatus; isPaid: boolean; trialEndsAt: Date | null; pilotEndsAt: Date | null; currentPeriodEnd: Date | null }[]>`
    select plan_id, status, is_paid, trial_ends_at, pilot_ends_at, current_period_end
    from subscriptions where organization_id = ${orgId}`;
  if (!sub) {
    return { planId: "starter", planName: "No plan", status: "none", active: false, isPaid: false, endsAt: null, limits: PLANS.starter.entitlements, statusLabel: "No active plan" };
  }
  const planId: PlanId = isPlanId(sub.planId) ? sub.planId : "starter";
  const plan = PLANS[planId];
  const now = Date.now();
  let status = sub.status;
  let endsAt: Date | null = null;
  if (status === "trialing") {
    endsAt = sub.trialEndsAt;
    if (endsAt && endsAt.getTime() < now) status = "expired";
  } else if (status === "pilot") {
    endsAt = sub.pilotEndsAt;
    if (endsAt && endsAt.getTime() < now) status = "expired";
  } else if (status === "active" || status === "past_due") {
    endsAt = sub.currentPeriodEnd;
  }
  // past_due keeps service running during Stripe's retry window.
  const active = status === "trialing" || status === "pilot" || status === "active" || status === "past_due";
  const limits = { ...plan.entitlements };
  if (status === "trialing") limits.aiAnalysesPerMonth = Math.min(limits.aiAnalysesPerMonth, TRIAL_AI_ANALYSES);
  const statusLabel =
    status === "trialing" ? "Free trial"
    : status === "pilot" ? "Pilot (unpaid)"
    : status === "active" ? "Active"
    : status === "past_due" ? "Payment failed — retrying"
    : status === "canceled" ? "Canceled"
    : status === "expired" ? "Expired"
    : "No active plan";
  return { planId, planName: plan.name, status, active, isPaid: sub.isPaid && status === "active", endsAt, limits, statusLabel };
}

export async function getUsage(db: Db, orgId: string): Promise<Usage> {
  const [row] = await db<Usage[]>`
    select
      (select count(*)::int from competitors where organization_id = ${orgId} and status <> 'archived') as competitors,
      (select count(*)::int from monitored_pages p join competitors c on c.id = p.competitor_id
         where p.organization_id = ${orgId} and p.status <> 'removed' and c.status <> 'archived') as pages,
      (select count(*)::int from client_workspaces where organization_id = ${orgId} and archived_at is null) as workspaces,
      (select count(*)::int from memberships where organization_id = ${orgId}) as seats,
      (select count(*)::int from ai_insights where organization_id = ${orgId} and generated_by = 'ai'
         and created_at >= date_trunc('month', now())) as ai_analyses_this_month,
      (select count(*)::int from generated_reports where organization_id = ${orgId}
         and created_at >= date_trunc('month', now())) as reports_this_month`;
  return row!;
}

type Limited = "competitors" | "pages" | "workspaces" | "seats" | "reportsPerMonth" | "aiAnalysesPerMonth";

const USAGE_KEY: Record<Limited, keyof Usage> = {
  competitors: "competitors",
  pages: "pages",
  workspaces: "workspaces",
  seats: "seats",
  reportsPerMonth: "reportsThisMonth",
  aiAnalysesPerMonth: "aiAnalysesThisMonth",
};

const LABEL: Record<Limited, string> = {
  competitors: "competitors",
  pages: "monitored pages",
  workspaces: "workspaces",
  seats: "team seats",
  reportsPerMonth: "reports this month",
  aiAnalysesPerMonth: "AI analyses this month",
};

/** Pure check, unit-testable. Throws EntitlementError when adding `adding` would exceed the plan. */
export function checkLimit(ent: OrgEntitlements, usage: Usage, key: Limited, adding = 1): void {
  if (!ent.active) throw new EntitlementError(`Your plan is ${ent.statusLabel.toLowerCase()}. Choose a plan to continue.`, "inactive");
  const limit = ent.limits[key];
  const used = usage[USAGE_KEY[key]];
  if (used + adding > limit) {
    throw new EntitlementError(`Your ${ent.planName} plan includes ${limit} ${LABEL[key]} (${used} used). Upgrade to add more.`, "limit");
  }
}

export function requireFeature(ent: OrgEntitlements, feature: "emailAlerts" | "pdfReports" | "whiteLabel" | "advancedComparison" | "browserRendering"): void {
  if (!ent.limits[feature]) {
    const names = { emailAlerts: "Email alerts", pdfReports: "PDF export", whiteLabel: "White-label reports", advancedComparison: "Advanced comparisons", browserRendering: "JavaScript rendering" };
    throw new EntitlementError(`${names[feature]} is not included in the ${ent.planName} plan.`, "feature");
  }
}

export async function assertWithinLimit(db: Db, orgId: string, key: Limited, adding = 1): Promise<OrgEntitlements> {
  const ent = await getEntitlements(db, orgId);
  const usage = await getUsage(db, orgId);
  checkLimit(ent, usage, key, adding);
  return ent;
}
