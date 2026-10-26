import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { createHash } from "node:crypto";
import { extractPrices, type PricePoint } from "./pricing";

export const EXTRACTOR_VERSION = 1;

export type BlockKind = "title" | "meta" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "li" | "cell" | "button" | "text";
export type Region = "main" | "nav" | "header" | "footer";

export interface ContentBlock {
  k: BlockKind;
  /** Visible text as extracted (whitespace-collapsed). Used as evidence. */
  t: string;
  /** Comparison key: text with volatile tokens masked. Used for diffing/hashing. */
  m: string;
  r: Region;
  /** True for struck-through text (often a previous/promotional price). */
  s?: boolean;
}

export interface NormalizedContent {
  v: number;
  title: string;
  description: string;
  blocks: ContentBlock[];
  prices: PricePoint[];
  links: { text: string; href: string }[];
}

const MAX_BLOCKS = 3000;
const MAX_BLOCK_CHARS = 1200;

const REMOVE_SELECTORS = [
  "script", "style", "noscript", "template", "svg", "canvas", "iframe", "object", "embed", "video", "audio",
  "picture source", "input", "select", "textarea", "[hidden]", "[aria-hidden='true']", "[style*='display:none']",
  "[style*='display: none']", "dialog:not([open])",
];

// Cookie banners / consent managers / chat widgets / rotating announcement bars.
const NOISE_PATTERN = /(cookie|consent|gdpr|ccpa|onetrust|cookiebot|truste|didomi|usercentrics|intercom|drift-|hubspot-messages|crisp-client|announcement-bar|promo-bar|marquee|ticker|carousel|slick-|swiper)/i;
const NOISE_TEXT = /^(we use cookies|this (web)?site uses cookies|accept (all )?cookies|cookie (settings|preferences|policy)|manage (cookie )?preferences|reject all|allow all)\b/i;

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "body", "dd", "details", "div", "dl", "dt", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "html", "li", "main", "nav", "ol",
  "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul", "button", "caption", "label",
]);

export function collapse(text: string): string {
  return text.replace(/[\s ​‌‍﻿]+/g, " ").trim();
}

/**
 * Masks volatile tokens so they do not register as changes: clock times,
 * relative times, ISO timestamps, long random tokens, UUIDs, session ids,
 * live counters. Meaningful content (prices, plan names, headings, dates of
 * posts) is preserved.
 */
export function maskVolatile(text: string): string {
  return collapse(
    text
      .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?\b/g, "‹ts›")
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s?(am|pm|AM|PM)?\b/g, "‹time›")
      .replace(/\b(\d+|a|an|one)\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/gi, "‹ago›")
      .replace(/\b(just now|moments ago|today|yesterday)\b/gi, "‹ago›")
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "‹uuid›")
      .replace(/\b(sid|sessionid|session_id|jsessionid|phpsessid|token|nonce|csrf)[=:]\s*[\w-]+/gi, "$1=‹tok›")
      .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g, "‹tok›")
      .replace(/\b\d[\d,.]*\s+(people|users|visitors|customers)\s+(are\s+)?(viewing|online|watching|browsing)( (this|now))?\b/gi, "‹live›")
      .replace(/©\s*\d{4}(\s*[-–]\s*\d{4})?/g, "©‹year›"),
  ).toLowerCase();
}

function classify(tag: string): BlockKind {
  if (/^h[1-6]$/.test(tag)) return tag as BlockKind;
  if (tag === "li" || tag === "dt" || tag === "dd") return "li";
  if (tag === "td" || tag === "th") return "cell";
  if (tag === "button" || tag === "summary") return "button";
  if (tag === "p" || tag === "blockquote" || tag === "figcaption") return "p";
  return "text";
}

function isNoiseElement(el: Element): boolean {
  const id = el.attribs?.id ?? "";
  const cls = el.attribs?.class ?? "";
  const role = el.attribs?.role ?? "";
  const aria = el.attribs?.["aria-label"] ?? "";
  if (role === "alertdialog") return true;
  return NOISE_PATTERN.test(`${id} ${cls} ${aria}`);
}

export function extractContent(html: string, baseUrl: string): NormalizedContent {
  const $ = cheerio.load(html);
  const title = collapse($("head > title").first().text() || $("title").first().text()).slice(0, 300);
  const description = collapse(
    $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? "",
  ).slice(0, 600);

  $(REMOVE_SELECTORS.join(",")).remove();
  $("*").each((_, node) => {
    if (node.type === "tag" && isNoiseElement(node)) $(node).remove();
  });

  const blocks: ContentBlock[] = [];
  const links: { text: string; href: string }[] = [];
  const pushBlock = (kind: BlockKind, raw: string, region: Region, struck: boolean) => {
    if (blocks.length >= MAX_BLOCKS) return;
    const t = collapse(raw).slice(0, MAX_BLOCK_CHARS);
    if (!t || t.length < 2 && !/\d/.test(t)) return;
    if (NOISE_TEXT.test(t)) return;
    const m = maskVolatile(t);
    if (!m.replace(/[^\p{L}\p{N}]/gu, "")) return;
    const prev = blocks[blocks.length - 1];
    if (prev && prev.m === m) return; // collapse exact consecutive duplicates
    blocks.push(struck ? { k: kind, t, m, r: region, s: true } : { k: kind, t, m, r: region });
  };

  type Ctx = { region: Region; struck: boolean };
  // Walk the DOM, accumulating inline text and flushing at block boundaries.
  const walk = (node: AnyNode, ctx: Ctx, buf: { text: string; kind: BlockKind; struck: boolean }) => {
    if (node.type === "text") {
      buf.text += (node as unknown as { data: string }).data;
      if (ctx.struck) buf.struck = true;
      return;
    }
    if (node.type !== "tag" && node.type !== "root") return;
    const el = node as Element;
    const tag = el.name?.toLowerCase() ?? "";
    if (tag === "br") {
      buf.text += " ";
      return;
    }
    let region = ctx.region;
    if (tag === "nav") region = "nav";
    else if (tag === "footer" && region === "main") region = "footer";
    else if (tag === "header" && region === "main") region = "header";
    const struck = ctx.struck || tag === "del" || tag === "s" || tag === "strike";
    if (tag === "a" && el.attribs?.href) {
      const text = collapse($(el).text());
      if (text && links.length < 500) {
        try {
          links.push({ text: text.slice(0, 120), href: new URL(el.attribs.href, baseUrl).toString() });
        } catch {
          /* ignore malformed */
        }
      }
    }
    // Inside navigation, each link is its own item (menus are usually inline anchors).
    if (BLOCK_TAGS.has(tag) || (tag === "a" && region === "nav")) {
      if (buf.text.trim()) pushBlock(buf.kind, buf.text, ctx.region, buf.struck);
      const inner = { text: "", kind: classify(tag), struck: false };
      for (const child of el.children ?? []) walk(child, { region, struck }, inner);
      if (inner.text.trim()) pushBlock(inner.kind, inner.text, region, inner.struck);
      buf.text = "";
      buf.struck = false;
      return;
    }
    for (const child of el.children ?? []) walk(child, { region, struck }, buf);
  };

  const body = $("body").get(0) ?? $.root().get(0);
  if (body) {
    const buf = { text: "", kind: "text" as BlockKind, struck: false };
    walk(body as AnyNode, { region: "main", struck: false }, buf);
    if (buf.text.trim()) pushBlock(buf.kind, buf.text, "main", buf.struck);
  }

  const allBlocks: ContentBlock[] = [];
  if (title) allBlocks.push({ k: "title", t: title, m: maskVolatile(title), r: "main" });
  if (description) allBlocks.push({ k: "meta", t: description, m: maskVolatile(description), r: "main" });
  allBlocks.push(...blocks);

  return {
    v: EXTRACTOR_VERSION,
    title,
    description,
    blocks: allBlocks,
    prices: extractPrices(allBlocks),
    links,
  };
}

/** Hash over masked comparison keys only, so volatile tokens never change the hash. */
export function contentHash(content: NormalizedContent): string {
  const h = createHash("sha256");
  h.update(`v${content.v}\n`);
  for (const b of content.blocks) h.update(`${b.k}|${b.m}\n`);
  return h.digest("hex");
}

export function visibleTextLength(content: NormalizedContent): number {
  return content.blocks.reduce((n, b) => n + (b.k === "title" || b.k === "meta" ? 0 : b.t.length), 0);
}
