import { createHash } from "node:crypto";
import { diffArrays } from "diff";
import type { ContentBlock, NormalizedContent, Region } from "./extract";
import { comparePrices, describePriceChange, type PriceChange } from "./pricing";

export type ChangeCategory = "pricing" | "product" | "features" | "positioning" | "announcement" | "general" | "unclassified";
export type Severity = "low" | "medium" | "high";
export type PageType = "homepage" | "pricing" | "features" | "product" | "blog" | "changelog" | "announcements" | "other";

export interface EvidenceBlock {
  k: string;
  t: string;
  r: Region;
}

export interface ChangeEvidence {
  added: EvidenceBlock[];
  removed: EvidenceBlock[];
  modified: { k: string; before: string; after: string; r: Region }[];
  headingsAdded: string[];
  headingsRemoved: string[];
  priceChanges: PriceChange[];
  titleChange: { before: string; after: string } | null;
  descriptionChange: { before: string; after: string } | null;
  stats: { addedBlocks: number; removedBlocks: number; modifiedBlocks: number; blocksBefore: number; blocksAfter: number; changedRatio: number; truncated: boolean };
}

export interface ChangeCandidate {
  category: ChangeCategory;
  severity: Severity;
  confidence: number;
  summary: string;
  needsReview: boolean;
  detectionMethod: string;
  fingerprint: string;
  evidence: ChangeEvidence;
}

const MAX_EVIDENCE = 40;

export function patternHash(maskedText: string): string {
  return createHash("sha256").update(maskedText).digest("hex").slice(0, 32);
}

function tokens(s: string): Set<string> {
  return new Set(s.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1));
}

export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

const isHeading = (k: string) => /^h[1-4]$/.test(k);
const ANNOUNCE = /\b(introducing|announcing|announcement|now available|launch(ed|es|ing)?|we('re| are) excited|general availability|generally available|new release|released|release notes|v\d+\.\d+|what's new)\b/i;
const FEATURE = /\b(feature|integration|integrations|api|automation|workflow|dashboard|analytics|ai\b|assistant|template|plugin|connector|sso|export|import|report(s|ing)?|security|collaboration|mobile app|capabilit(y|ies))\b/i;
const PRODUCT = /\b(product|platform|suite|module|add-?on|edition|app)\b/i;
const POSITIONING = /\b(the (leading|best|only|#1|first)|for (teams|enterprises|startups|agencies|businesses|marketers|developers)|trusted by|built for|all-in-one|helps? you|mission|why (us|choose))\b/i;
const CURRENCY_HINT = /(€|\$|£|¥|₹|\b(EUR|USD|GBP|CHF)\b)\s?\d|\d\s?(€|\b(EUR|USD|GBP|CHF)\b)/;

/**
 * Deterministically compares two snapshots of the same page. Returns null
 * when there is no meaningful difference after volatile-token masking and
 * user suppressions.
 */
export function detectChange(
  prev: NormalizedContent,
  next: NormalizedContent,
  opts: { pageType: PageType; suppressed?: Set<string> } = { pageType: "other" },
): ChangeCandidate | null {
  const suppressed = opts.suppressed ?? new Set<string>();
  const keep = (b: ContentBlock) => !suppressed.has(patternHash(b.m));
  const before = prev.blocks.filter(keep);
  const after = next.blocks.filter(keep);

  const parts = diffArrays(before.map((b) => b.m), after.map((b) => b.m));
  let ai = 0;
  let bi = 0;
  const added: ContentBlock[] = [];
  const removed: ContentBlock[] = [];
  const modified: { k: string; before: string; after: string; r: Region }[] = [];
  let pendingRemoved: ContentBlock[] = [];

  const flushPairs = (adds: ContentBlock[]) => {
    const remainingAdds = [...adds];
    for (const r of pendingRemoved) {
      let bestIdx = -1;
      let best = 0.4;
      remainingAdds.forEach((a, idx) => {
        const s = similarity(r.m, a.m);
        if (s >= best) {
          best = s;
          bestIdx = idx;
        }
      });
      // Singular page elements (title, description, main headline) pair by kind even when rewritten entirely.
      if (bestIdx < 0 && (r.k === "title" || r.k === "meta" || r.k === "h1")) {
        bestIdx = remainingAdds.findIndex((a) => a.k === r.k);
      }
      if (bestIdx >= 0) {
        const a = remainingAdds.splice(bestIdx, 1)[0]!;
        modified.push({ k: a.k, before: r.t, after: a.t, r: a.r });
      } else {
        removed.push(r);
      }
    }
    added.push(...remainingAdds);
    pendingRemoved = [];
  };

  for (const part of parts) {
    const count = part.count ?? part.value.length;
    if (part.removed) {
      pendingRemoved.push(...before.slice(ai, ai + count));
      ai += count;
    } else if (part.added) {
      flushPairs(after.slice(bi, bi + count));
      bi += count;
    } else {
      if (pendingRemoved.length) flushPairs([]);
      ai += count;
      bi += count;
    }
  }
  if (pendingRemoved.length) flushPairs([]);

  if (added.length === 0 && removed.length === 0 && modified.length === 0) return null;

  const priceResult = comparePrices(prev.prices, next.prices);
  const titleChange = prev.title !== next.title && prev.title && next.title ? { before: prev.title, after: next.title } : null;
  const descriptionChange = prev.description !== next.description && (prev.description || next.description) ? { before: prev.description, after: next.description } : null;
  const headingsAdded = [...added.filter((b) => isHeading(b.k)).map((b) => b.t), ...modified.filter((m) => isHeading(m.k)).map((m) => m.after)];
  const headingsRemoved = [...removed.filter((b) => isHeading(b.k)).map((b) => b.t), ...modified.filter((m) => isHeading(m.k)).map((m) => m.before)];

  const totalChanged = added.length + removed.length + modified.length;
  const changedRatio = totalChanged / Math.max(1, Math.max(before.length, after.length));
  const onlyChrome = [...added, ...removed].every((b) => b.r === "nav" || b.r === "footer") && modified.every((m) => m.r === "nav" || m.r === "footer");

  const addedText = [...added.map((b) => b.t), ...modified.map((m) => m.after)].join("\n");
  const removedText = [...removed.map((b) => b.t), ...modified.map((m) => m.before)].join("\n");
  const changedText = `${addedText}\n${removedText}`;

  // ---- Classification -----------------------------------------------------
  let category: ChangeCategory = "general";
  let severity: Severity = "low";
  let confidence = 0.6;
  let needsReview = false;
  let summary = "";
  const methods: string[] = ["block-diff"];

  const confidentPrice = priceResult.changes.filter((c) => c.kind === "amount_changed" || c.kind === "currency_changed" || c.kind === "plan_added" || c.kind === "plan_removed");
  const promoChanges = priceResult.changes.filter((c) => c.kind === "promotion_added" || c.kind === "promotion_removed");

  if (confidentPrice.length > 0) {
    methods.push("price-extraction");
    category = "pricing";
    const amountChanges = confidentPrice.filter((c) => c.kind === "amount_changed");
    severity = amountChanges.length > 0 || confidentPrice.some((c) => c.kind === "plan_removed") ? "high" : "medium";
    confidence = confidentPrice.every((c) => c.confidence === "high") ? 0.95 : 0.8;
    summary = confidentPrice.slice(0, 2).map(describePriceChange).join("; ");
    if (confidentPrice.length > 2) summary += ` (+${confidentPrice.length - 2} more pricing changes)`;
  } else if (promoChanges.length > 0) {
    methods.push("price-extraction");
    category = "pricing";
    severity = "medium";
    confidence = 0.7;
    summary = promoChanges.map(describePriceChange).join("; ");
  } else if (priceResult.ambiguous || (CURRENCY_HINT.test(changedText) && opts.pageType === "pricing")) {
    category = "unclassified";
    severity = "medium";
    confidence = 0.4;
    needsReview = true;
    summary = "Possible pricing change detected, but prices could not be parsed with enough confidence — please review the evidence.";
  } else if (onlyChrome) {
    category = "general";
    severity = "low";
    confidence = 0.7;
    summary = "Navigation or footer content changed";
  } else if ((opts.pageType === "blog" || opts.pageType === "changelog" || opts.pageType === "announcements") && headingsAdded.length > 0) {
    category = "announcement";
    severity = "medium";
    confidence = 0.85;
    summary = `New entr${headingsAdded.length === 1 ? "y" : "ies"} published: ${headingsAdded.slice(0, 2).map((h) => `“${h}”`).join(", ")}`;
  } else if (ANNOUNCE.test(addedText)) {
    category = "announcement";
    severity = "medium";
    confidence = 0.7;
    methods.push("keyword");
    summary = headingsAdded.length ? `Announcement-style content added: “${headingsAdded[0]}”` : "Announcement-style content added";
  } else if (opts.pageType !== "features" && opts.pageType !== "product" && (titleChange || modified.some((m) => m.k === "h1") || added.some((b) => b.k === "h1") || (opts.pageType === "homepage" && POSITIONING.test(addedText)))) {
    category = "positioning";
    severity = titleChange || modified.some((m) => m.k === "h1") ? "medium" : "low";
    confidence = 0.7;
    const h1 = modified.find((m) => m.k === "h1");
    summary = h1
      ? `Headline changed from “${h1.before}” to “${h1.after}”`
      : titleChange
        ? `Page title changed to “${titleChange.after}”`
        : "Messaging and positioning content changed";
  } else if (opts.pageType === "features" || (headingsAdded.length > 0 && FEATURE.test(headingsAdded.join(" ")))) {
    category = "features";
    severity = headingsAdded.length > 0 ? "medium" : "low";
    confidence = opts.pageType === "features" ? 0.8 : 0.65;
    summary = headingsAdded.length ? `Feature content updated: “${headingsAdded[0]}”` : "Feature descriptions updated";
  } else if (opts.pageType === "product" || (headingsAdded.length > 0 && PRODUCT.test(headingsAdded.join(" ")))) {
    category = "product";
    severity = headingsAdded.length > 0 ? "medium" : "low";
    confidence = opts.pageType === "product" ? 0.8 : 0.6;
    summary = headingsAdded.length ? `Product content updated: “${headingsAdded[0]}”` : "Product page content updated";
  } else {
    category = "general";
    severity = changedRatio > 0.3 ? "medium" : "low";
    confidence = 0.6;
    summary = `Page content updated (${[added.length && `${added.length} added`, removed.length && `${removed.length} removed`, modified.length && `${modified.length} modified`].filter(Boolean).join(", ")})`;
  }

  if (changedRatio > 0.6 && before.length > 10 && category !== "pricing") {
    needsReview = true;
    severity = severity === "low" ? "medium" : severity;
    summary = `Major page restructure (${Math.round(changedRatio * 100)}% of content blocks changed). ${summary}`;
    confidence = Math.min(confidence, 0.6);
  }

  const fingerprint = createHash("sha256")
    .update([...added.map((b) => `+${b.m}`), ...removed.map((b) => `-${b.m}`), ...modified.map((m) => `~${m.before.toLowerCase()}→${m.after.toLowerCase()}`)].sort().join("\n"))
    .digest("hex")
    .slice(0, 40);

  const ev = (b: ContentBlock): EvidenceBlock => ({ k: b.k, t: b.t, r: b.r });
  const truncated = added.length > MAX_EVIDENCE || removed.length > MAX_EVIDENCE || modified.length > MAX_EVIDENCE;
  return {
    category,
    severity,
    confidence,
    summary: summary.slice(0, 500),
    needsReview,
    detectionMethod: methods.join("+"),
    fingerprint,
    evidence: {
      added: added.slice(0, MAX_EVIDENCE).map(ev),
      removed: removed.slice(0, MAX_EVIDENCE).map(ev),
      modified: modified.slice(0, MAX_EVIDENCE),
      headingsAdded: headingsAdded.slice(0, 20),
      headingsRemoved: headingsRemoved.slice(0, 20),
      priceChanges: priceResult.changes,
      titleChange,
      descriptionChange,
      stats: {
        addedBlocks: added.length,
        removedBlocks: removed.length,
        modifiedBlocks: modified.length,
        blocksBefore: before.length,
        blocksAfter: after.length,
        changedRatio: Math.round(changedRatio * 1000) / 1000,
        truncated,
      },
    },
  };
}

const CHALLENGE = /(checking your browser|enable javascript and cookies|attention required|verify you are (a )?human|are you a robot|captcha|access denied|request blocked|ddos protection by|just a moment\.\.\.)/i;

/**
 * Detects bot-challenge / interstitial pages. These are never treated as
 * content: we record access restriction and never try to bypass it.
 */
export function looksLikeChallengePage(content: NormalizedContent): boolean {
  const text = content.blocks.slice(0, 30).map((b) => b.t).join(" ");
  return CHALLENGE.test(`${content.title} ${text}`) && text.length < 2000;
}

/** Guards against extraction failures being reported as content removal. */
export function looksDegraded(prev: NormalizedContent | null, next: NormalizedContent, nextTextLength: number): boolean {
  if (nextTextLength < 40) return true;
  if (!prev) return false;
  const prevLen = prev.blocks.reduce((n, b) => n + b.t.length, 0);
  return prevLen > 2000 && nextTextLength < prevLen * 0.15;
}
