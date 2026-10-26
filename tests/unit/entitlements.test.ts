import { describe, expect, it } from "vitest";
import { checkLimit, EntitlementError, requireFeature, type OrgEntitlements, type Usage } from "@/server/billing/entitlements";
import { PLANS } from "@/server/billing/plans";

const ent = (planId: "starter" | "growth" | "agency", active = true): OrgEntitlements => ({
  planId, planName: PLANS[planId].name, status: active ? "active" : "expired", active, isPaid: active, endsAt: null, limits: PLANS[planId].entitlements, statusLabel: active ? "Active" : "Expired",
});
const usage = (u: Partial<Usage> = {}): Usage => ({ competitors: 0, pages: 0, workspaces: 1, seats: 1, aiAnalysesThisMonth: 0, reportsThisMonth: 0, ...u });

describe("plan entitlements", () => {
  it("matches the published plan limits", () => {
    expect(PLANS.starter.entitlements).toMatchObject({ competitors: 5, pages: 15 });
    expect(PLANS.growth.entitlements).toMatchObject({ competitors: 15, pages: 60, emailAlerts: true, pdfReports: true });
    expect(PLANS.agency.entitlements).toMatchObject({ competitors: 50, pages: 200, whiteLabel: true });
    expect(PLANS.starter.priceEur).toBe(19);
    expect(PLANS.growth.priceEur).toBe(49);
    expect(PLANS.agency.priceEur).toBe(129);
  });
  it("allows usage up to the limit and rejects beyond it", () => {
    expect(() => checkLimit(ent("starter"), usage({ competitors: 4 }), "competitors")).not.toThrow();
    expect(() => checkLimit(ent("starter"), usage({ competitors: 5 }), "competitors")).toThrow(EntitlementError);
    expect(() => checkLimit(ent("starter"), usage({ pages: 13 }), "pages", 3)).toThrow(/15 monitored pages/);
  });
  it("rejects everything when the plan is inactive", () => {
    expect(() => checkLimit(ent("agency", false), usage(), "competitors")).toThrow(/expired/);
  });
  it("gates features by plan", () => {
    expect(() => requireFeature(ent("starter"), "pdfReports")).toThrow(/not included/);
    expect(() => requireFeature(ent("growth"), "pdfReports")).not.toThrow();
    expect(() => requireFeature(ent("growth"), "whiteLabel")).toThrow();
    expect(() => requireFeature(ent("agency"), "whiteLabel")).not.toThrow();
  });
});
