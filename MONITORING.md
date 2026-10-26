# Monitoring & change detection

## Pipeline

Implemented in `src/server/monitoring/pipeline.ts` (`processJob`). Each step records an outcome in `monitoring_attempts`.

1. **Schedule** — `scheduleDuePages()` enqueues pages whose `next_check_at` has passed, whose competitor is active, whose organization has an active plan (trial/pilot/active/past_due), and that have no active job. Demo organizations are never scheduled.
2. **Claim** — workers claim jobs with `FOR UPDATE SKIP LOCKED` and a 5-minute lease. Expired leases are recovered (`recoverStuckJobs`) and retried up to `max_attempts` (3).
3. **Validate target** — `validateTargetUrl()` (scheme, credentials, ports, host form, IP literals). DNS is checked again at socket-connect time.
4. **robots.txt** — fetched per origin, cached 24h in `domain_state`, evaluated for the `RivalTideBot` token (fallback `*`). RFC 9309 semantics: 4xx → allowed; 5xx/429/unreachable → treated as disallowed for now (transient, retried). Disallowed pages are marked **Access restricted** and are never fetched.
5. **Politeness** — `reserveDomainSlot()` atomically reserves the next request slot per origin (`MONITOR_DOMAIN_INTERVAL_MS`, raised by `Crawl-delay`, capped at 300 s). If the slot is taken the job is deferred without consuming an attempt.
6. **Fetch** — `safeFetch()` (undici): manual redirects (≤5, each re-validated), conditional requests (`If-None-Match` / `If-Modified-Since`), 15 s timeout, 3 MB cap, HTML/text only, no cookies or credentials, identifying user agent. Optional `renderPage()` (Playwright) for pages marked *JavaScript rendering*: every sub-request is validated, images/media/fonts are blocked, no state persists between checks.
7. **Extract & normalize** — `extractContent()` (Cheerio) removes scripts, styles, hidden elements, iframes, cookie/consent banners, chat widgets and rotating banners; walks the DOM into text blocks (headings, paragraphs, list items, cells, buttons) tagged with region (main/nav/header/footer) and strike-through state; extracts title, meta description, links and price points.
8. **Guards** — bot-challenge/interstitial pages → `access_denied` (never bypassed). Near-empty pages, or pages that shrink to <15% of previous text, → `empty_content` (treated as an extraction failure, not as removed content).
9. **Compare** — content hash over masked comparison keys. Equal hash → `unchanged` (no new snapshot stored). Otherwise a new snapshot is stored and `detectChange()` compares it with the previous successful snapshot.
10. **Change record** — inserted with both snapshot references, evidence, category, severity, confidence and method. Deduplicated by fingerprint for 30 days per page (stops rotating banners from re-alerting). Snapshots are pinned as evidence.
11. **Insight** — `generateInsightForChange()` (AI if configured and within allowance and material; otherwise deterministic).
12. **Alerts** — per member and workspace preference; never twice for the same change; email only when configured and included in the plan (max 20 immediate alert emails per user per day).

The **first snapshot is a baseline** and never produces a change. Comparisons become possible after the second successful check (`success_count >= 2`).

## Health states

| State | Meaning |
| --- | --- |
| Healthy | Last attempt succeeded |
| Awaiting first check | No attempt yet |
| Delayed | 1–2 consecutive transient failures (timeouts, 5xx, network) |
| Failed | ≥3 consecutive failures |
| Access restricted | robots.txt disallow, 401/403/451, bot challenge, or address not allowed |
| Paused | Page or competitor paused |

Last successful fetch and last attempted fetch are stored and displayed separately.

## Noise handling

`maskVolatile()` masks before comparison (evidence still shows the real text): ISO timestamps, clock times, relative times ("3 minutes ago", "today"), UUIDs, session/token parameters, long random tokens, live counters ("42 people viewing"), copyright years. Elements matching cookie/consent/chat/carousel/ticker patterns are removed. Navigation and footer changes are classified as low severity and do not alert.

Users can mark a change **Irrelevant** or **Incorrect**: the changed blocks' masked text is stored in `change_suppressions` and filtered out of future comparisons for that page. Marking **Relevant** clears matching suppressions.

## Classification

`detectChange()` in `src/server/detection/diff.ts`:

| Category | Rule (first match wins) |
| --- | --- |
| Pricing | Confident price changes from the pricing parser (amount, currency, plan added/removed) or promotional changes |
| Unclassified (needs review) | Ambiguous price pairing, or currency-looking text changed on a pricing page without confident parsing |
| General (low) | Only navigation/footer changed |
| Announcement | New headings on blog/changelog/announcement pages, or announcement language ("introducing", "now available", …) |
| Positioning | Title or main headline changed (non feature/product pages), or positioning language on the homepage |
| Features / Product | Feature/product pages, or new headings with feature/product vocabulary |
| General | Everything else (medium if >30% of blocks changed) |

Severity: high for standard price changes or removed plans; medium for promotions, announcements, positioning headline changes, new feature headings; low otherwise. Changes affecting >60% of blocks are flagged "major restructure — needs review". Confidence is a heuristic score (0.4 for ambiguous, 0.6–0.95 otherwise) shown on every change.

## Pricing parser

`src/server/detection/pricing.ts`:

- Requires an explicit currency symbol or ISO code; bare numbers are never prices.
- Period from the price block and its immediate siblings (stops at the next heading or price): monthly, annual, one-time; flags *billed annually*, *per seat*, *promotional* (save/%-off/limited/first month…), *struck-through* (previous price), tax incl./excl.
- Plan label: nearest preceding heading or short label within the same card.
- Confidence: high (currency + period + plan), medium (period or plan with pricing context), low otherwise. Only non-struck, non-promotional, medium/high prices are compared.
- Comparison key: plan + period + billing frequency + per-seat. Monthly is never compared with annual. Currency changes are reported as such; **no currency conversion** is performed.
- Multiple prices sharing one key → ambiguous → change marked *Needs review* instead of guessing.

## Retention

`runMaintenance()` (daily, in the worker): deletes unpinned snapshots older than `SNAPSHOT_RETENTION_DAYS` (default 180) that are not a page's latest snapshot or change evidence; attempt logs older than the retention window; finished jobs older than 30 days; expired sessions/tokens/rate-limit rows; expired demo organizations and demo users.

## Cost controls

Unchanged pages store no new snapshot; conditional requests avoid downloading unchanged pages when servers support ETag/Last-Modified; AI is used only for material changes and cached by input hash; manual checks are rate-limited; browser rendering is opt-in per page and plan-gated. Usage is recorded in `usage_events` (fetches, failed fetches, renders, AI tokens + estimated cost, emails, PDFs) and visible on the Operations page.
