import { describe, expect, it } from "vitest";
import { extractContent } from "@/server/detection/extract";
import { detectChange, looksLikeChallengePage, patternHash } from "@/server/detection/diff";

const doc = (main: string, title = "Acme") => extractContent(`<html><head><title>${title}</title></head><body><nav><a href="/">Home</a></nav><main>${main}</main><footer>© 2026 Acme</footer></body></html>`, "https://acme.com");

describe("detectChange", () => {
  it("returns null for identical content", () => {
    expect(detectChange(doc("<p>Hello world</p>"), doc("<p>Hello world</p>"), { pageType: "homepage" })).toBeNull();
  });

  it("returns null when only volatile content changed", () => {
    expect(detectChange(doc("<p>Hello</p><p>Updated 2 hours ago</p>"), doc("<p>Hello</p><p>Updated 9 hours ago</p>"), { pageType: "homepage" })).toBeNull();
  });

  it("classifies a confident price increase as high-severity pricing", () => {
    const c = detectChange(doc("<h3>Growth</h3><p>€29 per month</p>"), doc("<h3>Growth</h3><p>€39 per month</p>"), { pageType: "pricing" })!;
    expect(c.category).toBe("pricing");
    expect(c.severity).toBe("high");
    expect(c.confidence).toBeGreaterThanOrEqual(0.9);
    expect(c.summary).toMatch(/Growth plan monthly price increased from €29 to €39/);
    expect(c.evidence.modified[0]).toMatchObject({ before: "€29 per month", after: "€39 per month" });
  });

  it("marks ambiguous currency text on pricing pages as unclassified for review", () => {
    const c = detectChange(doc("<p>Contact us. Packages from €500</p>"), doc("<p>Contact us. Packages from €650</p>"), { pageType: "pricing" })!;
    expect(c.category).toBe("unclassified");
    expect(c.needsReview).toBe(true);
  });

  it("classifies new blog headings as announcements", () => {
    const c = detectChange(doc("<h2>Old post</h2><p>a</p>"), doc("<h2>Introducing Workflows 2.0</h2><p>b</p><h2>Old post</h2><p>a</p>"), { pageType: "blog" })!;
    expect(c.category).toBe("announcement");
    expect(c.evidence.headingsAdded).toContain("Introducing Workflows 2.0");
  });

  it("classifies headline changes on the homepage as positioning", () => {
    const c = detectChange(doc("<h1>Analytics for everyone</h1><p>x</p>"), doc("<h1>The AI analytics platform for agencies</h1><p>x</p>"), { pageType: "homepage" })!;
    expect(c.category).toBe("positioning");
    expect(c.evidence.modified[0]?.k).toBe("h1");
  });

  it("classifies feature-page additions as features", () => {
    const c = detectChange(doc("<h2>Dashboards</h2><p>See data.</p>"), doc("<h2>Dashboards</h2><p>See data.</p><h2>Slack integration</h2><p>Get alerts in Slack.</p>"), { pageType: "features" })!;
    expect(c.category).toBe("features");
    expect(c.severity).toBe("medium");
  });

  it("treats nav/footer-only changes as low severity", () => {
    const a = extractContent(`<html><body><nav><a>Home</a></nav><main><p>Same</p></main></body></html>`, "https://x.com");
    const b = extractContent(`<html><body><nav><a>Home</a><a>Careers</a></nav><main><p>Same</p></main></body></html>`, "https://x.com");
    const c = detectChange(a, b, { pageType: "homepage" })!;
    expect(c.severity).toBe("low");
  });

  it("produces stable fingerprints for equivalent changes", () => {
    const a = detectChange(doc("<p>A</p>"), doc("<p>A</p><p>Banner B</p>"), { pageType: "other" })!;
    const b = detectChange(doc("<p>A</p>"), doc("<p>A</p><p>Banner B</p>"), { pageType: "other" })!;
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("honours user suppressions", () => {
    const prev = doc("<p>Stable</p><p>Rotating tip one</p>");
    const next = doc("<p>Stable</p><p>Rotating tip two</p>");
    const suppressed = new Set([patternHash("rotating tip one"), patternHash("rotating tip two")]);
    expect(detectChange(prev, next, { pageType: "other", suppressed })).toBeNull();
  });
});

describe("looksLikeChallengePage", () => {
  it("detects bot-challenge interstitials", () => {
    expect(looksLikeChallengePage(doc("<p>Checking your browser before accessing acme.com</p>", "Just a moment..."))).toBe(true);
    expect(looksLikeChallengePage(doc("<p>Normal content</p>"))).toBe(false);
  });
});
