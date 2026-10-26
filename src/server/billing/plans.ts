/**
 * Server-side plan entitlements. Prices are launch hypotheses (EUR/month),
 * not validated market prices. Limits are enforced server-side in services.
 */
export type PlanId = "starter" | "growth" | "agency" | "demo";

export interface Entitlements {
  competitors: number;
  pages: number;
  workspaces: number;
  seats: number;
  minCheckIntervalHours: number;
  aiAnalysesPerMonth: number;
  reportsPerMonth: number;
  emailAlerts: boolean;
  pdfReports: boolean;
  whiteLabel: boolean;
  advancedComparison: boolean;
  browserRendering: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceEur: number;
  tagline: string;
  highlights: string[];
  entitlements: Entitlements;
  public: boolean;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceEur: 19,
    tagline: "For founders tracking a handful of direct competitors.",
    highlights: ["5 competitors", "Up to 15 monitored pages", "Daily scheduled checks", "Change history & evidence", "Basic reports"],
    entitlements: {
      competitors: 5, pages: 15, workspaces: 1, seats: 1, minCheckIntervalHours: 24, aiAnalysesPerMonth: 0,
      reportsPerMonth: 4, emailAlerts: false, pdfReports: false, whiteLabel: false, advancedComparison: false, browserRendering: false,
    },
    public: true,
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceEur: 49,
    tagline: "For SaaS teams that need pricing and product intelligence.",
    highlights: ["15 competitors", "Up to 60 monitored pages", "Daily scheduled checks", "AI insights (100 analyses / month)", "Email notifications", "PDF reports"],
    entitlements: {
      competitors: 15, pages: 60, workspaces: 2, seats: 3, minCheckIntervalHours: 24, aiAnalysesPerMonth: 100,
      reportsPerMonth: 20, emailAlerts: true, pdfReports: true, whiteLabel: false, advancedComparison: false, browserRendering: true,
    },
    public: true,
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceEur: 129,
    tagline: "For agencies delivering competitor intelligence to clients.",
    highlights: ["50 competitors", "Up to 200 monitored pages", "Multiple client workspaces", "Advanced comparisons", "White-label reports", "Team collaboration"],
    entitlements: {
      competitors: 50, pages: 200, workspaces: 25, seats: 10, minCheckIntervalHours: 24, aiAnalysesPerMonth: 400,
      reportsPerMonth: 100, emailAlerts: true, pdfReports: true, whiteLabel: true, advancedComparison: true, browserRendering: true,
    },
    public: true,
  },
  demo: {
    id: "demo",
    name: "Demo",
    priceEur: 0,
    tagline: "Fictional demo environment.",
    highlights: [],
    entitlements: {
      competitors: 10, pages: 40, workspaces: 3, seats: 1, minCheckIntervalHours: 24, aiAnalysesPerMonth: 0,
      reportsPerMonth: 50, emailAlerts: false, pdfReports: true, whiteLabel: true, advancedComparison: true, browserRendering: false,
    },
    public: false,
  },
};

/** Trials get Growth features with a reduced AI allowance to cap cost. */
export const TRIAL_PLAN: PlanId = "growth";
export const TRIAL_AI_ANALYSES = 25;

export function isPlanId(v: string): v is PlanId {
  return v in PLANS;
}
