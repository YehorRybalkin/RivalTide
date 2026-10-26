import type { ContentBlock } from "./extract";

export type BillingPeriod = "month" | "year" | "one_time" | "unknown";
export type PriceConfidence = "high" | "medium" | "low";

export interface PricePoint {
  amount: number;
  currency: string;
  raw: string;
  plan: string | null;
  period: BillingPeriod;
  billedAnnually: boolean;
  perSeat: boolean;
  promotional: boolean;
  /** Struck-through price (e.g. "was €49"): not treated as the current standard price. */
  struck: boolean;
  tax: "incl" | "excl" | null;
  confidence: PriceConfidence;
  context: string;
}

const SYMBOLS: Record<string, string> = {
  "€": "EUR", "$": "USD", "US$": "USD", "£": "GBP", "¥": "JPY", "₹": "INR", "CA$": "CAD", "C$": "CAD",
  "A$": "AUD", "AU$": "AUD", "R$": "BRL", "zł": "PLN", "₽": "RUB", "₩": "KRW", "kr": "SEK", "Fr.": "CHF",
};
const CODES = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "JPY", "INR", "SEK", "NOK", "DKK", "PLN", "BRL", "NZD", "SGD"];

const NUM = String.raw`(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const SYM = String.raw`(US\$|CA\$|C\$|AU\$|A\$|R\$|€|\$|£|¥|₹|₽|₩|Fr\.)`;
const CODE = `(${CODES.join("|")})`;
const PRICE_RE = new RegExp(
  [
    String.raw`${SYM}\s?${NUM}`, // €29, $1,299.00
    String.raw`\b${CODE}\s?${NUM}`, // EUR 29
    String.raw`${NUM}\s?${SYM}`, // 29 €, 29,99€
    String.raw`${NUM}\s?${CODE}\b`, // 29 EUR
    String.raw`${NUM}\s?(kr|zł)\b`, // 99 kr
  ].join("|"),
  "g",
);

const PERIOD_MONTH = /(\/\s?(mo|month|mth)\b|per\s+month|a\s+month|\bmonthly\b|\bmo\.|\/\s?mes|pro\s+monat|par\s+mois|\/\s?monat)/i;
const PERIOD_YEAR = /(\/\s?(yr|year|annum)\b|per\s+year|a\s+year|\bannually\b|\byearly\b|per\s+annum|pro\s+jahr|par\s+an)/i;
const BILLED_ANNUALLY = /(billed\s+(annually|yearly)|paid\s+(annually|yearly)|annual\s+(billing|plan)|when\s+billed\s+(annually|yearly))/i;
const ONE_TIME = /(one[-\s]?time|lifetime|once|single\s+payment|setup\s+fee|one[-\s]?off)/i;
const PER_SEAT = /(per\s+(user|seat|member|editor)|\/\s?(user|seat|member)|each\s+(user|seat))/i;
const PROMO = /(\bsave\b|\d+\s?%\s?off|\bdiscount|\bpromo|limited[-\s]time|\bsale\b|special\s+offer|first\s+(month|year|\d+\s+months)|introductory|launch\s+(price|offer)|black\s+friday|coupon)/i;
const TAX_INCL = /(incl\.?|including|inc\.?)\s+(vat|tax|gst)|tax\s+included|vat\s+included/i;
const TAX_EXCL = /(excl\.?|excluding|ex\.?|plus|\+)\s+(vat|tax|gst)|(vat|tax|gst)\s+excluded|before\s+tax/i;
const PRICING_CONTEXT = /(plan|pricing|price|tier|month|year|billed|per\s|seat|user|subscribe|starter|basic|pro\b|business|enterprise|team|premium|growth|free\s+trial)/i;
const NOT_A_PLAN = /^(monthly|annually|yearly|annual|most popular|popular|recommended|best value|billed|save|per|month|year|new|beta|get started|start|buy|try|sign up|contact( sales)?|choose|select|current plan|\W+)$/i;

export function parseAmount(raw: string): number | null {
  let s = raw.replace(/\s/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    s = s.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const last = parts[parts.length - 1] ?? "";
    if (parts.length > 2 || last.length === 3) s = parts.join("");
    else s = parts.join(".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? n : null;
}

function currencyFrom(sym?: string, code?: string): string | null {
  if (code) return code.toUpperCase();
  if (sym) return SYMBOLS[sym] ?? null;
  return null;
}

function findPlanLabel(blocks: ContentBlock[], index: number): string | null {
  for (let j = index - 1; j >= Math.max(0, index - 8); j--) {
    const b = blocks[j]!;
    if (b.k === "title" || b.k === "meta") break;
    const t = b.t.trim();
    if (PRICE_RE.test(t)) {
      PRICE_RE.lastIndex = 0;
      // Another price above: plan label belongs to that card unless this is a heading.
      if (!/^h[1-6]$/.test(b.k)) break;
    }
    PRICE_RE.lastIndex = 0;
    const isHeading = /^h[2-5]$/.test(b.k);
    const shortLabel = t.length <= 32 && !/\d/.test(t) && t.split(" ").length <= 4;
    if ((isHeading || shortLabel) && !NOT_A_PLAN.test(t) && t.length >= 2) return t;
  }
  return null;
}

export function normalizePlan(plan: string | null): string {
  return (plan ?? "").toLowerCase().replace(/\bplan\b/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim() || "?";
}

/** Extracts currency amounts and validates them against nearby pricing semantics. */
export function extractPrices(blocks: ContentBlock[]): PricePoint[] {
  const out: PricePoint[] = [];
  blocks.forEach((block, i) => {
    if (block.k === "title" || block.k === "meta") return;
    if (out.length >= 200) return;
    PRICE_RE.lastIndex = 0;
    const matches = [...block.t.matchAll(PRICE_RE)];
    if (matches.length === 0) return;
    // Period/billing qualifiers are often in sibling elements ("€29" then "/month").
    const following: string[] = [];
    for (const b of blocks.slice(i + 1, i + 3)) {
      // Stop at the next card: a heading or another price belongs to a different plan.
      PRICE_RE.lastIndex = 0;
      if (/^h[1-6]$/.test(b.k) || PRICE_RE.test(b.t) || b.t.length > 80) break;
      following.push(b.t);
    }
    PRICE_RE.lastIndex = 0;
    const preceding = blocks[i - 1] && blocks[i - 1]!.t.length <= 80 ? [blocks[i - 1]!.t] : [];
    const context = [...preceding, block.t, ...following].join(" · ").slice(0, 300);
    const plan = findPlanLabel(blocks, i);

    for (const m of matches) {
      const sym = m[1] ?? m[6] ?? undefined;
      const code = m[3] ?? m[8] ?? undefined;
      const numStr = m[2] ?? m[4] ?? m[5] ?? m[7] ?? m[9];
      const currency = currencyFrom(sym, code) ?? (m[10] === "kr" ? "SEK" : m[10] === "zł" ? "PLN" : null);
      if (!numStr || !currency) continue;
      const amount = parseAmount(numStr);
      if (amount === null) continue;

      const local = [block.t, ...following].join(" ");
      let period: BillingPeriod = "unknown";
      if (ONE_TIME.test(local)) period = "one_time";
      else if (PERIOD_MONTH.test(local)) period = "month";
      else if (PERIOD_YEAR.test(local)) period = "year";
      const billedAnnually = BILLED_ANNUALLY.test(context);
      const promotional = PROMO.test(local);
      const tax = TAX_INCL.test(context) ? "incl" : TAX_EXCL.test(context) ? "excl" : null;

      let confidence: PriceConfidence = "low";
      if (period !== "unknown" && plan) confidence = "high";
      else if (period !== "unknown" || (plan && PRICING_CONTEXT.test(context))) confidence = "medium";

      out.push({
        amount,
        currency,
        raw: m[0].trim(),
        plan,
        period,
        billedAnnually,
        perSeat: PER_SEAT.test(local),
        promotional,
        struck: Boolean(block.s),
        tax,
        confidence,
        context,
      });
    }
  });
  return out;
}

export function priceKey(p: PricePoint): string {
  return [normalizePlan(p.plan), p.period, p.billedAnnually ? "annual-billing" : "", p.perSeat ? "seat" : ""].join("|");
}

export interface PriceChange {
  kind: "amount_changed" | "currency_changed" | "plan_added" | "plan_removed" | "promotion_added" | "promotion_removed";
  plan: string | null;
  period: BillingPeriod;
  billedAnnually: boolean;
  perSeat: boolean;
  before: { amount: number; currency: string; raw: string } | null;
  after: { amount: number; currency: string; raw: string } | null;
  confidence: PriceConfidence;
  note?: string;
}

/**
 * Compares price points between snapshots. Only standard (non-struck,
 * non-promotional) prices with at least medium confidence are compared for
 * amount changes. Currencies are never converted.
 */
export function comparePrices(before: PricePoint[], after: PricePoint[]): { changes: PriceChange[]; ambiguous: boolean } {
  const usable = (list: PricePoint[]) => list.filter((p) => !p.struck && !p.promotional && p.confidence !== "low");
  const group = (list: PricePoint[]) => {
    const map = new Map<string, PricePoint[]>();
    for (const p of usable(list)) {
      const k = priceKey(p);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  };
  const a = group(before);
  const b = group(after);
  const changes: PriceChange[] = [];
  let ambiguous = false;
  const summary = (p: PricePoint) => ({ amount: p.amount, currency: p.currency, raw: p.raw });

  for (const [key, olds] of a) {
    const news = b.get(key);
    const ref = olds[0]!;
    if (!news) {
      if (ref.plan) {
        changes.push({ kind: "plan_removed", plan: ref.plan, period: ref.period, billedAnnually: ref.billedAnnually, perSeat: ref.perSeat, before: summary(ref), after: null, confidence: "medium" });
      }
      continue;
    }
    if (olds.length !== 1 || news.length !== 1) {
      // Several prices share the same plan/period key: cannot pair them reliably.
      const oldSet = olds.map((p) => `${p.currency}${p.amount}`).sort().join(",");
      const newSet = news.map((p) => `${p.currency}${p.amount}`).sort().join(",");
      if (oldSet !== newSet) ambiguous = true;
      continue;
    }
    const o = olds[0]!;
    const n = news[0]!;
    const confidence: PriceConfidence = o.confidence === "high" && n.confidence === "high" ? "high" : "medium";
    if (o.currency !== n.currency) {
      changes.push({ kind: "currency_changed", plan: n.plan, period: n.period, billedAnnually: n.billedAnnually, perSeat: n.perSeat, before: summary(o), after: summary(n), confidence, note: "Currency changed; no conversion applied." });
    } else if (o.amount !== n.amount) {
      changes.push({ kind: "amount_changed", plan: n.plan, period: n.period, billedAnnually: n.billedAnnually, perSeat: n.perSeat, before: summary(o), after: summary(n), confidence });
    }
  }
  for (const [key, news] of b) {
    if (a.has(key)) continue;
    const ref = news[0]!;
    if (ref.plan) {
      changes.push({ kind: "plan_added", plan: ref.plan, period: ref.period, billedAnnually: ref.billedAnnually, perSeat: ref.perSeat, before: null, after: summary(ref), confidence: "medium" });
    }
  }
  const promoKey = (list: PricePoint[]) => new Set(list.filter((p) => p.promotional && p.confidence !== "low").map((p) => `${normalizePlan(p.plan)}|${p.currency}${p.amount}`));
  const pa = promoKey(before);
  const pb = promoKey(after);
  for (const k of pb) if (!pa.has(k)) changes.push({ kind: "promotion_added", plan: k.split("|")[0] ?? null, period: "unknown", billedAnnually: false, perSeat: false, before: null, after: null, confidence: "medium", note: k });
  for (const k of pa) if (!pb.has(k)) changes.push({ kind: "promotion_removed", plan: k.split("|")[0] ?? null, period: "unknown", billedAnnually: false, perSeat: false, before: null, after: null, confidence: "medium", note: k });
  return { changes, ambiguous };
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function describePriceChange(c: PriceChange): string {
  const plan = c.plan ? `${c.plan} plan` : "A plan";
  const period = c.period === "month" ? "monthly" : c.period === "year" ? "annual" : c.period === "one_time" ? "one-time" : "";
  const qualifier = [period, c.billedAnnually ? "(billed annually)" : "", c.perSeat ? "per-seat" : ""].filter(Boolean).join(" ");
  switch (c.kind) {
    case "amount_changed": {
      const dir = c.after!.amount > c.before!.amount ? "increased" : "decreased";
      return `${plan} ${qualifier ? qualifier + " " : ""}price ${dir} from ${formatMoney(c.before!.amount, c.before!.currency)} to ${formatMoney(c.after!.amount, c.after!.currency)}`;
    }
    case "currency_changed":
      return `${plan} ${qualifier} price currency changed from ${c.before!.raw} to ${c.after!.raw} (not converted)`;
    case "plan_added":
      return `New pricing entry: ${plan}${qualifier ? ` ${qualifier}` : ""} at ${formatMoney(c.after!.amount, c.after!.currency)}`;
    case "plan_removed":
      return `Pricing entry removed: ${plan}${qualifier ? ` ${qualifier}` : ""} (was ${formatMoney(c.before!.amount, c.before!.currency)})`;
    case "promotion_added":
      return `Promotional pricing appeared${c.plan && c.plan !== "?" ? ` for ${c.plan}` : ""}`;
    case "promotion_removed":
      return `Promotional pricing removed${c.plan && c.plan !== "?" ? ` for ${c.plan}` : ""}`;
  }
}
