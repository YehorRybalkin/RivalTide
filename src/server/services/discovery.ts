import { extractContent } from "../detection/extract";
import type { PageType } from "../detection/diff";
import { FetchFailure, safeFetch } from "../monitoring/fetcher";
import { checkRobots } from "../monitoring/robots";
import { assertResolvesPublic, normalizeUserUrl, sameSite, UnsafeUrlError } from "../monitoring/url-safety";

export interface PageSuggestion {
  url: string;
  pageType: PageType;
  label: string;
  allowedByRobots: boolean | null;
  source: "homepage" | "link" | "guess";
}

export interface DiscoveryResult {
  url: string;
  reachable: boolean;
  title: string | null;
  description: string | null;
  problem: string | null;
  suggestions: PageSuggestion[];
}

const PATTERNS: { type: PageType; re: RegExp; label: string }[] = [
  { type: "pricing", re: /\/(pricing|plans|prices|preise|tarifs|precios)(\/|$)/i, label: "Pricing" },
  { type: "features", re: /\/(features|capabilities|funktionen)(\/|$)/i, label: "Features" },
  { type: "product", re: /\/(product|products|platform|solutions)(\/|$)/i, label: "Product" },
  { type: "changelog", re: /\/(changelog|release-notes|releases|updates|whats-new)(\/|$)/i, label: "Changelog" },
  { type: "announcements", re: /\/(news|announcements|press|newsroom)(\/|$)/i, label: "Announcements" },
  { type: "blog", re: /\/(blog|articles|insights)(\/|$)/i, label: "Blog" },
];

/** Classifies a URL path into a page type (used for manual additions too). */
export function guessPageType(url: string): PageType {
  const u = new URL(url);
  if (u.pathname === "/" || u.pathname === "") return "homepage";
  return PATTERNS.find((p) => p.re.test(u.pathname))?.type ?? "other";
}

/**
 * Validates a competitor website, reads basic metadata (only if permitted by
 * robots.txt), and suggests a small set of pages to monitor. Never crawls
 * beyond the homepage.
 */
export async function discoverPages(rawUrl: string): Promise<DiscoveryResult> {
  let url: string;
  try {
    url = normalizeUserUrl(rawUrl);
    await assertResolvesPublic(new URL(url).hostname);
  } catch (e) {
    const msg = e instanceof UnsafeUrlError ? e.message : "Invalid URL";
    return { url: rawUrl, reachable: false, title: null, description: null, problem: msg, suggestions: [] };
  }
  const home = new URL(url);
  const homepage = `${home.origin}/`;
  const suggestions: PageSuggestion[] = [];
  const robotsHome = await checkRobots(homepage);
  suggestions.push({ url: homepage, pageType: "homepage", label: "Homepage", allowedByRobots: robotsHome.allowed, source: "homepage" });
  if (url !== homepage) {
    suggestions.push({ url, pageType: guessPageType(url), label: "Entered page", allowedByRobots: (await checkRobots(url)).allowed, source: "link" });
  }

  let title: string | null = null;
  let description: string | null = null;
  let problem: string | null = null;
  let reachable = false;
  if (!robotsHome.allowed) {
    problem = robotsHome.reason ?? "The homepage is disallowed by robots.txt";
  } else {
    try {
      const res = await safeFetch(homepage, { timeoutMs: 12_000 });
      reachable = true;
      const content = extractContent(res.body, res.finalUrl);
      title = content.title || null;
      description = content.description || null;
      const seen = new Set(suggestions.map((s) => s.url));
      for (const link of content.links) {
        let u: URL;
        try {
          u = new URL(link.href);
        } catch {
          continue;
        }
        if (!/^https?:$/.test(u.protocol) || !sameSite(u, home)) continue;
        u.hash = "";
        u.search = "";
        const pattern = PATTERNS.find((p) => p.re.test(u.pathname));
        if (!pattern) continue;
        // Prefer index pages (e.g. /blog) over individual posts (/blog/some-post).
        const depth = u.pathname.split("/").filter(Boolean).length;
        if (depth > 2) continue;
        const s = u.toString();
        if (seen.has(s) || suggestions.some((x) => x.pageType === pattern.type)) continue;
        seen.add(s);
        suggestions.push({ url: s, pageType: pattern.type, label: pattern.label, allowedByRobots: null, source: "link" });
        if (suggestions.length >= 8) break;
      }
    } catch (e) {
      problem = e instanceof FetchFailure ? `Could not read the homepage: ${e.message}` : "Could not read the homepage";
    }
  }
  // Common paths that were not linked from the homepage (unverified guesses).
  for (const p of [{ path: "/pricing", type: "pricing" as PageType, label: "Pricing" }, { path: "/features", type: "features" as PageType, label: "Features" }]) {
    if (!suggestions.some((s) => s.pageType === p.type)) {
      suggestions.push({ url: `${home.origin}${p.path}`, pageType: p.type, label: `${p.label} (not linked — verify it exists)`, allowedByRobots: null, source: "guess" });
    }
  }
  for (const s of suggestions) {
    if (s.allowedByRobots === null) s.allowedByRobots = (await checkRobots(s.url)).allowed;
  }
  return { url, reachable, title, description, problem, suggestions };
}
