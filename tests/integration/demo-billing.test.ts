import { describe, expect, it } from "vitest";
import { systemDb, withUser } from "@/server/db";
import { createDemoAccount } from "@/server/demo/seed";
import { resolveWorkspace } from "@/server/services/context";
import { createCompetitor } from "@/server/services/competitors";
import { listChanges } from "@/server/services/changes";
import { handleStripeWebhook } from "@/server/billing/stripe";
import { getEntitlements } from "@/server/billing/entitlements";
import { generateInsightForChange } from "@/server/services/insights";
import { sendEmail } from "@/server/email";
import { authenticate, signUp } from "@/server/services/accounts";
import { makeTenant } from "./helpers";

describe("demo environment", () => {
  it("seeds fictional data through the real detection engine, isolated and read-only", async () => {
    const { userId, workspaceId } = await createDemoAccount();
    const ctx = await withUser(userId, (tx) => resolveWorkspace(tx, userId, workspaceId));
    expect(ctx.isDemo).toBe(true);
    const changes = await withUser(userId, (tx) => listChanges(tx, ctx, { page: 1 }));
    expect(changes.total).toBeGreaterThanOrEqual(6);
    expect(changes.items.some((c) => c.category === "pricing" && c.summary.includes("€29") && c.summary.includes("€39"))).toBe(true);
    const reports = await systemDb()<{ isDemo: boolean }[]>`select is_demo from generated_reports where workspace_id = ${workspaceId}`;
    expect(reports.length).toBe(2);
    expect(reports.every((r) => r.isDemo)).toBe(true);
    // Demo is read-only and never monitored
    await expect(withUser(userId, (tx) => createCompetitor(tx, ctx, { name: "X", websiteUrl: "https://x.example.com" }))).rejects.toThrow(/read-only/);
    const [{ n } = { n: -1 }] = await systemDb()<{ n: number }[]>`select count(*)::int as n from monitoring_jobs where organization_id = ${ctx.orgId}`;
    expect(n).toBe(0);
    // Demo users cannot sign in with a password
    const [u] = await systemDb()<{ email: string }[]>`select email from users where id = ${userId}`;
    expect(await authenticate(u!.email, "anything")).toBeNull();
    // Demo data is invisible to real tenants
    const real = await makeTenant("real");
    const seen = await withUser(real.userId, (tx) => tx`select 1 from detected_changes where workspace_id = ${workspaceId}`);
    expect(seen).toHaveLength(0);
  });
});

describe("billing boundary without Stripe credentials", () => {
  it("rejects webhooks and never marks trials or pilots as paid", async () => {
    expect(await handleStripeWebhook("{}", "sig")).toMatchObject({ ok: false, error: "Stripe is not configured" });
    const t = await makeTenant("bill");
    const ent = await getEntitlements(systemDb(), t.orgId);
    expect(ent.status).toBe("trialing");
    expect(ent.isPaid).toBe(false);
    expect(ent.active).toBe(true);
    await systemDb()`update subscriptions set trial_ends_at = now() - interval '1 day' where organization_id = ${t.orgId}`;
    const expired = await getEntitlements(systemDb(), t.orgId);
    expect(expired).toMatchObject({ status: "expired", active: false });
  });
});

describe("email boundary", () => {
  it("records unsent email honestly when no provider is configured", async () => {
    const r = await sendEmail({ orgId: null, userId: null, to: "x@example.com", subject: "s", template: "t", html: "<p>h</p>", text: "h" });
    expect(r.status).toBe("skipped_not_configured");
    const [row] = await systemDb()<{ status: string; sentAt: Date | null }[]>`select status, sent_at from email_deliveries where id = ${r.deliveryId}`;
    expect(row).toMatchObject({ status: "skipped_not_configured", sentAt: null });
  });
});

describe("accounts", () => {
  it("prevents duplicate sign-ups and verifies passwords", async () => {
    const email = `dup-${Date.now()}@example.com`;
    await signUp({ email, password: "a very long password", name: "A" });
    await expect(signUp({ email: email.toUpperCase(), password: "a very long password", name: "B" })).rejects.toThrow(/already exists/);
    expect(await authenticate(email, "wrong password!!")).toBeNull();
    expect((await authenticate(email, "a very long password"))?.email).toBe(email);
  });
  it("generating an insight for a missing change is a no-op", async () => {
    expect(await generateInsightForChange("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
