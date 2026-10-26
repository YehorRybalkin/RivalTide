# RivalTide

**Stay ahead of the competition.** Track competitors. Understand every move. Make smarter decisions.

RivalTide monitors publicly accessible competitor web pages on a schedule, detects meaningful changes deterministically, keeps before/after evidence for every change, and turns verified changes into competitive intelligence: dashboards, alerts, insights, comparisons, and reports. AI interpretation is optional and always separated from observed facts.

Primary audience: marketing agencies managing several client workspaces; also founders, SaaS teams, and consultants.

> Status: functional MVP. See [Production readiness](#production-readiness) for what is verified and what still needs to be configured or validated before charging customers.

## What's in the box

| Area | Implemented |
| --- | --- |
| Accounts | Sign up, sign in, sign out, password reset (email or dev log), session management, account deletion |
| Tenancy | Organizations → members (owner/member) → client workspaces; PostgreSQL row-level security on every tenant table |
| Monitoring | Durable Postgres job queue, scheduler, standalone worker, robots.txt, per-domain politeness, retries with backoff, stuck-job recovery, SSRF protection, optional Playwright rendering |
| Change detection | Normalized snapshots, volatile-content masking, block-level diff, pricing parser (plan/period/currency/promo/tax), categories, severity, confidence, dedup, user-feedback suppression |
| Evidence | Before/after diff viewer, snapshot viewer, snapshot hashes, frozen evidence in reports |
| Intelligence | Deterministic insights for every change; optional Anthropic/OpenAI analysis with schema validation, prompt-injection hardening, caching, cost tracking; emerging themes (≥3 changes, ≥2 competitors) |
| Alerts | In-app notification center, per-workspace preferences (all / high-priority / pricing-only / digest-only), daily/weekly digests, email via Resend or a local stub |
| Benchmarking | 2–5 competitor matrix with evidence links, "Not available" for missing data, claim vs. observed labels, custom criteria, CSV export |
| Reports | Weekly brief, competitor deep dive, agency client report; frozen versions; PDF export; white-label branding (Agency) |
| Agency mode | Multiple client workspaces, agency overview, workspace switcher |
| Billing | Server-side plan entitlements and limits, trials, founder-provisioned pilots, Stripe checkout/portal/webhooks (disabled until configured) |
| Demo | "Explore Live Demo" creates an isolated, read-only, clearly-labeled fictional workspace that expires after 24h |
| Ops | Operator dashboard (reliability, usage, estimated AI cost), health endpoint |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Radix primitives (shadcn-style components) · Lucide · Recharts · PostgreSQL 15+ (Supabase-compatible) via `postgres` · Zod · Cheerio · undici · Playwright · `@react-pdf/renderer` · Anthropic SDK · Stripe · Vitest · Playwright Test.

## Local development

Prerequisites: Node.js 20.9+ (22 recommended) and PostgreSQL 15+ (local install, Docker, or a Supabase project).

```bash
npm install
cp .env.example .env.local          # then edit DATABASE_URL
npm run db:migrate                  # applies migrations/*.sql
npm run dev                         # web app on http://localhost:3000
npm run worker                      # in a second terminal: scheduler + monitoring worker
```

Quick Postgres via Docker:

```bash
docker run -d --name rivaltide-db -e POSTGRES_USER=rivaltide -e POSTGRES_PASSWORD=rivaltide -e POSTGRES_DB=rivaltide -p 5432:5432 postgres:16
```

Then open http://localhost:3000, click **Start Monitoring** to create an account, or **Explore Live Demo** for fictional data.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` / `npm run build` / `npm start` | Web app |
| `npm run worker` | Long-running worker (scheduler, checks, digests, themes, retention) |
| `npm run worker:once` | Process everything due, then exit (cron-style) |
| `npm run db:migrate` / `npm run db:reset` | Apply migrations / drop and re-create schema (non-production only) |
| `npm run pilot:grant -- --email owner@agency.com --plan agency --days 60` | Grant an unpaid, time-limited pilot |
| `npm run operator:grant -- you@company.com` | Give a user access to the internal Operations page |
| `npm run typecheck` / `npm test` / `npm run test:e2e` | Quality checks (see [TESTING.md](TESTING.md)) |

Without an AI key, email provider, or Stripe keys the app runs fully: insights are rule-based, emails are logged locally and recorded as *not sent*, and checkout is disabled.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, data model, decisions and assumptions
- [MONITORING.md](MONITORING.md) — monitoring pipeline, change detection, pricing parser, failure handling
- [SECURITY.md](SECURITY.md) — tenant isolation, SSRF, auth, AI safety, threat model
- [DEPLOYMENT.md](DEPLOYMENT.md) — Supabase + Vercel + worker host, AI/email/Stripe setup, cost drivers
- [TESTING.md](TESTING.md) — test suites and how to run them

## Production readiness

Verified in this repository (see TESTING.md for details):

- Production build and strict type checking pass.
- 127 unit/integration tests pass against PostgreSQL, including cross-tenant isolation (RLS), SSRF rejection, pricing extraction, noise masking, dedup, monitoring failures, alerts, reports, demo isolation, billing/email boundaries.
- 4 Playwright end-to-end tests pass: sign-up → organization → competitor → page selection → baseline → manual check → detected pricing change → evidence → feedback → report + PDF; cross-tenant 404; private-address rejection; demo.
- The standalone worker (`npm run worker:once`) schedules and processes checks without any browser session; Playwright rendering was exercised against a local fixture site.

**Not verified here** (environment limits — do these before launch):

- Monitoring a real public website end to end. The build environment's network policy blocked outbound requests to arbitrary sites, so all fetch tests used a local fixture website over real HTTP. Run the checklist in DEPLOYMENT.md against one permitted public page.
- Live Anthropic/OpenAI calls (no API key available). The provider code compiles against the official SDK and falls back safely; run one analysis with a real key before enabling AI for customers.
- Resend delivery and Stripe checkout/webhooks (no credentials). Both are implemented behind boundaries and disabled until configured; test in Stripe test mode first.
- Legal pages are templates marked for legal review. No compliance certification is implied.

## License

Proprietary — all rights reserved (update as appropriate).
