import { describe, expect, it } from "vitest";
import { extractContent } from "@/server/detection/extract";
import { comparePrices, parseAmount } from "@/server/detection/pricing";

const pricing = (cards: string) => extractContent(`<html><head><title>Pricing</title></head><body><main><h1>Pricing</h1>${cards}</main></body></html>`, "https://x.com/pricing");

describe("parseAmount", () => {
  it.each([["29", 29], ["29.99", 29.99], ["29,99", 29.99], ["1,299", 1299], ["1.299,50", 1299.5], ["1,299.50", 1299.5], ["1 299", 1299]])(
    "%s → %d", (raw, n) => expect(parseAmount(raw)).toBe(n));
});

describe("extractPrices", () => {
  it("detects plan, period, currency with high confidence", () => {
    const c = pricing(`<div><h3>Starter</h3><p>€19</p><p>/month</p></div><div><h3>Pro</h3><p>€49 per month</p></div>`);
    const starter = c.prices.find((p) => p.plan === "Starter");
    expect(starter).toMatchObject({ amount: 19, currency: "EUR", period: "month", confidence: "high" });
    expect(c.prices.find((p) => p.plan === "Pro")).toMatchObject({ amount: 49, period: "month" });
  });

  it("distinguishes annual, billed-annually, one-time, per-seat and tax", () => {
    const c = pricing(`<div><h3>Team</h3><p>$12 per user / month, billed annually</p></div>
      <div><h3>Lifetime</h3><p>$299 one-time payment</p></div>
      <div><h3>Enterprise</h3><p>€1,200 per year excl. VAT</p></div>`);
    expect(c.prices.find((p) => p.plan === "Team")).toMatchObject({ amount: 12, currency: "USD", period: "month", billedAnnually: true, perSeat: true });
    expect(c.prices.find((p) => p.plan === "Lifetime")).toMatchObject({ amount: 299, period: "one_time" });
    expect(c.prices.find((p) => p.plan === "Enterprise")).toMatchObject({ amount: 1200, period: "year", tax: "excl" });
  });

  it("flags promotional prices", () => {
    const c = pricing(`<div><h3>Pro</h3><p>€29/month — save 20% for a limited time</p></div>`);
    expect(c.prices[0]?.promotional).toBe(true);
  });

  it("does not treat arbitrary numbers as prices", () => {
    const c = pricing(`<p>Over 4,000 teams and 99.9% uptime since 2019</p><p>Version 3.2 released</p>`);
    expect(c.prices).toHaveLength(0);
  });

  it("gives low confidence to a bare currency amount without plan or period", () => {
    const c = extractContent(`<html><body><p>We raised $20 million in funding.</p></body></html>`, "https://x.com");
    expect(c.prices[0]?.confidence).toBe("low");
  });
});

describe("comparePrices", () => {
  it("detects an amount change", () => {
    const a = pricing(`<div><h3>Pro</h3><p>€29/month</p></div>`);
    const b = pricing(`<div><h3>Pro</h3><p>€39/month</p></div>`);
    const r = comparePrices(a.prices, b.prices);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ kind: "amount_changed", before: { amount: 29 }, after: { amount: 39 }, confidence: "high" });
  });

  it("does not compare monthly against annual", () => {
    const a = pricing(`<div><h3>Pro</h3><p>€29/month</p></div>`);
    const b = pricing(`<div><h3>Pro</h3><p>€290/year</p></div>`);
    const kinds = comparePrices(a.prices, b.prices).changes.map((c) => c.kind).sort();
    expect(kinds).toEqual(["plan_added", "plan_removed"]);
  });

  it("reports currency changes without conversion", () => {
    const a = pricing(`<div><h3>Pro</h3><p>€29/month</p></div>`);
    const b = pricing(`<div><h3>Pro</h3><p>$29/month</p></div>`);
    expect(comparePrices(a.prices, b.prices).changes[0]?.kind).toBe("currency_changed");
  });

  it("ignores low-confidence amounts", () => {
    const a = extractContent(`<html><body><p>We raised $20 million.</p></body></html>`, "https://x.com");
    const b = extractContent(`<html><body><p>We raised $30 million.</p></body></html>`, "https://x.com");
    expect(comparePrices(a.prices, b.prices).changes).toHaveLength(0);
  });
});
