import type { ChangeEvidence } from "../detection/diff";
import { describePriceChange } from "../detection/pricing";

export interface ChangeForAnalysis {
  id: string;
  competitorName: string;
  pageType: string;
  sourceUrl: string;
  category: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  summary: string;
  detectedAt: Date;
  evidence: ChangeEvidence;
}

const q = (s: string, n = 220) => `“${s.length > n ? s.slice(0, n) + "…" : s}”`;

/** Deterministic, verifiable statements derived only from stored evidence. */
export function observedFacts(c: ChangeForAnalysis): string[] {
  const facts: string[] = [];
  const date = c.detectedAt.toISOString().slice(0, 10);
  for (const p of c.evidence.priceChanges.filter((p) => p.kind !== "promotion_added" && p.kind !== "promotion_removed").slice(0, 4)) {
    facts.push(`${describePriceChange(p)} on ${c.competitorName}'s ${c.pageType} page (detected ${date}).`);
  }
  if (c.evidence.titleChange) facts.push(`Page title changed from ${q(c.evidence.titleChange.before)} to ${q(c.evidence.titleChange.after)}.`);
  for (const h of c.evidence.headingsAdded.slice(0, 3)) facts.push(`New heading on the page: ${q(h)}.`);
  for (const h of c.evidence.headingsRemoved.slice(0, 2)) if (!c.evidence.headingsAdded.length) facts.push(`Heading removed: ${q(h)}.`);
  for (const m of c.evidence.modified.filter((m) => !/^h[1-4]$/.test(m.k)).slice(0, 2)) facts.push(`Text changed from ${q(m.before, 160)} to ${q(m.after, 160)}.`);
  if (facts.length === 0) {
    const s = c.evidence.stats;
    facts.push(`${c.summary} (${s.addedBlocks} added, ${s.removedBlocks} removed, ${s.modifiedBlocks} modified content blocks, detected ${date}).`);
  }
  return facts.slice(0, 6);
}
