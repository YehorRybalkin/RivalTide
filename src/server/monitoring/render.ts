import type { Browser } from "playwright";
import { env } from "../env";
import { FetchFailure, type FetchResult } from "./fetcher";
import { assertResolvesPublic, validateTargetUrl } from "./url-safety";

/**
 * JavaScript rendering for pages that need it. Runs only in the worker.
 * Every request the page makes (document, scripts, XHR, redirects) is
 * validated against the SSRF rules; heavy resource types are blocked.
 * No cookies or storage persist between checks; CAPTCHAs/challenges are
 * never solved — such pages are reported as access-restricted.
 */
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = import("playwright").then(({ chromium }) =>
      chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
        args: ["--disable-dev-shm-usage", "--no-first-run", "--disable-extensions", "--disable-background-networking"],
      }),
    );
    browserPromise.catch(() => (browserPromise = null));
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close().catch(() => {});
  }
}

const BLOCKED_TYPES = new Set(["image", "media", "font", "websocket", "eventsource", "manifest", "texttrack"]);

export async function renderPage(url: string): Promise<FetchResult> {
  const cfg = env();
  if (!cfg.MONITOR_BROWSER_ENABLED) {
    throw new FetchFailure("Browser rendering is disabled on this worker (MONITOR_BROWSER_ENABLED)", "unsupported_content");
  }
  const target = validateTargetUrl(url);
  await assertResolvesPublic(target.hostname).catch((e) => {
    throw new FetchFailure((e as Error).message, "blocked_url");
  });
  const started = Date.now();
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: cfg.MONITOR_USER_AGENT,
    javaScriptEnabled: true,
    acceptDownloads: false,
    serviceWorkers: "block",
    viewport: { width: 1366, height: 900 },
  });
  const verifiedHosts = new Map<string, boolean>();
  try {
    await context.route("**/*", async (route) => {
      const req = route.request();
      if (BLOCKED_TYPES.has(req.resourceType())) return route.abort("blockedbyclient");
      try {
        const u = validateTargetUrl(req.url());
        const host = u.hostname;
        if (!verifiedHosts.has(host)) {
          verifiedHosts.set(host, await assertResolvesPublic(host).then(() => true, () => false));
        }
        if (!verifiedHosts.get(host)) return route.abort("blockedbyclient");
        return route.continue();
      } catch {
        return route.abort("blockedbyclient");
      }
    });
    const page = await context.newPage();
    let response;
    try {
      response = await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: cfg.MONITOR_TIMEOUT_MS * 2 });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    } catch (e) {
      const msg = (e as Error).message;
      if (/timeout/i.test(msg)) throw new FetchFailure("Rendering timed out", "timeout", undefined, true);
      throw new FetchFailure(`Rendering failed: ${msg.split("\n")[0]}`, "network_error", undefined, true);
    }
    const status = response?.status() ?? 0;
    if (status === 401 || status === 403 || status === 451) throw new FetchFailure(`Access denied (HTTP ${status})`, "access_denied", status);
    if (status === 429) throw new FetchFailure("Rate limited by the website (HTTP 429)", "rate_limited", status, true);
    if (status >= 400) throw new FetchFailure(`HTTP ${status}`, "http_error", status, status >= 500);
    const finalUrl = page.url();
    validateTargetUrl(finalUrl);
    const html = await page.content();
    if (Buffer.byteLength(html) > cfg.MONITOR_MAX_BYTES) throw new FetchFailure("Rendered page is too large", "too_large", status);
    return {
      status,
      finalUrl,
      contentType: "text/html",
      body: html,
      bytes: Buffer.byteLength(html),
      etag: null,
      lastModified: null,
      notModified: false,
      redirects: [],
      durationMs: Date.now() - started,
    };
  } finally {
    await context.close().catch(() => {});
  }
}
