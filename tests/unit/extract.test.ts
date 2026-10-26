import { describe, expect, it } from "vitest";
import { contentHash, extractContent, maskVolatile } from "@/server/detection/extract";

const page = (inner: string, extra = "") => `<!doctype html><html><head><title>Acme — Pricing</title>
<meta name="description" content="Simple pricing for teams"></head><body>${extra}
<nav><a href="/features">Features</a><a href="/pricing">Pricing</a></nav>
<main>${inner}</main><footer>© 2026 Acme Inc. All rights reserved.</footer>
<script>window.__token="abc123def456ghi789jkl012mno345"</script></body></html>`;

describe("extractContent", () => {
  it("extracts title, description, headings, and blocks with regions", () => {
    const c = extractContent(page("<h1>Plans</h1><p>Choose a plan.</p>"), "https://acme.com/pricing");
    expect(c.title).toBe("Acme — Pricing");
    expect(c.description).toBe("Simple pricing for teams");
    expect(c.blocks.find((b) => b.k === "h1")?.t).toBe("Plans");
    expect(c.blocks.find((b) => b.t === "Features")?.r).toBe("nav");
    expect(c.blocks.some((b) => b.t.includes("window.__token"))).toBe(false);
    expect(c.links.some((l) => l.href === "https://acme.com/features")).toBe(true);
  });

  it("removes cookie banners and hidden elements", () => {
    const c = extractContent(page("<p>Main content here</p>", `<div id="cookie-banner"><p>We use cookies</p><button>Accept all</button></div><div hidden>secret</div>`), "https://acme.com");
    expect(c.blocks.some((b) => /cookies|secret|Accept all/.test(b.t))).toBe(false);
  });

  it("produces identical hashes when only volatile tokens differ", () => {
    const a = extractContent(page("<p>Updated 3 minutes ago at 10:42</p><p>Session sid=abc123</p><p>Real content</p>"), "https://x.com");
    const b = extractContent(page("<p>Updated 5 minutes ago at 11:07</p><p>Session sid=zzz999</p><p>Real content</p>"), "https://x.com");
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it("produces different hashes for meaningful changes", () => {
    const a = extractContent(page("<p>Real content</p>"), "https://x.com");
    const b = extractContent(page("<p>Different content</p>"), "https://x.com");
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  it("masks copyright years and live counters", () => {
    expect(maskVolatile("© 2025 Acme")).toBe(maskVolatile("© 2026 Acme"));
    expect(maskVolatile("42 people are viewing this now")).toBe(maskVolatile("17 people are viewing this now"));
  });

  it("keeps struck-through prices flagged", () => {
    const c = extractContent(page("<h3>Pro</h3><p><del>€49</del></p><p>€39/month</p>"), "https://x.com");
    expect(c.prices.find((p) => p.amount === 49)?.struck).toBe(true);
    expect(c.prices.find((p) => p.amount === 39)?.struck).toBe(false);
  });
});
