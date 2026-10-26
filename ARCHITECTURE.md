# Architecture

## Overview

```
                    ┌────────────────────────────────────────────┐
 Browser ──HTTPS──▶ │ Next.js web app (Vercel or container)      │
                    │  • Server components & server actions      │
                    │  • Route handlers: PDF, CSV, Stripe, cron  │
                    │  • Inline baseline/manual checks (static)  │
                    └───────────────┬────────────────────────────┘
                                    │ postgres (RLS-scoped transactions)
                    ┌───────────────▼────────────────────────────┐
                    │ PostgreSQL (Supabase or any Postgres 15+)  │
                    │  tenants · snapshots · changes · queue     │
                    └───────────────▲────────────────────────────┘
                                    │ system role (FOR UPDATE SKIP LOCKED)
                    ┌───────────────┴────────────────────────────┐
                    │ Worker (container with Chromium)           │
                    │  scheduler → claim → robots → fetch/render │
                    │  → extract → diff → change → insight/alert │
                    │  digests · themes · retention cleanup      │
                    └──────┬─────────────────┬──────────────┬────┘
                           ▼                 ▼              ▼
                 Competitor websites   Anthropic/OpenAI   Resend
                 (public pages only)   (optional)         (optional)
```

The web app and the worker share one codebase (`src/server/**` is plain TypeScript with no Next.js dependency, so the worker imports it directly via `tsx`).

## Key decisions

| Decision | Rationale |
| --- | --- |
| **Postgres-backed job queue** (`monitoring_jobs`) instead of Redis/SQS | One less service to operate. `FOR UPDATE SKIP LOCKED` claims, lease timestamps for stuck-job recovery, a partial unique index guaranteeing one active job per page, and idempotency keys per schedule slot. Scales comfortably to tens of thousands of daily checks. |
| **Separate worker process** | Serverless functions are a poor fit for browser rendering and long fetch loops. The worker is a single Node process deployable to any container host. A `/api/cron/monitor` fallback exists for small deployments. |
| **Deterministic detection first, AI second** | Every change is a diff between two stored snapshots. AI only interprets verified changes; observed facts shown with an insight are generated from evidence, not from the model. |
| **RLS enforced via `SET LOCAL ROLE`** | Each request runs in a transaction as `rivaltide_app` (no BYPASSRLS) with `app.user_id` set. Policies use SECURITY DEFINER helpers (`app_user_org_ids()`). Even a missing `WHERE` clause cannot read another tenant's rows. System contexts (worker, auth bootstrap, webhooks) use the owner connection deliberately. |
| **First-party session auth on Postgres** (instead of Supabase Auth) | Assumption documented here: Supabase Auth (GoTrue) could not be run or verified in the build environment. Auth is implemented on the same Postgres with scrypt password hashes and hashed, HttpOnly session tokens, so it works on Supabase Postgres unchanged and keeps a single authorization model (RLS keyed on `app.user_id`). Migrating to Supabase Auth later means mapping `auth.uid()` into `app.user_id`; the policies stay the same. |
| **Snapshots store normalized content, not raw HTML** | Smaller storage, no stored scripts, consistent diffing. Content hashes are computed over masked comparison keys so volatile tokens never change the hash. |
| **Reports freeze their content** | `generated_reports.content` stores the evidence excerpts and insights at generation time with a SHA-256 hash; evidence snapshots are pinned so retention never deletes them. |
| **Demo = ephemeral real tenant flagged `is_demo`** | Exercises every real screen without duplicating UI or mixing fictional data into real tenants. Demo orgs are read-only, never scheduled, labeled in every view and PDF, and deleted after 24h. |
| **Entitlements in code** (`src/server/billing/plans.ts`) | Limits are enforced server-side in services. The `subscriptions` table holds state (trial / pilot / active / past_due / canceled); `is_paid` is true only for Stripe-verified subscriptions. |

## Code layout

```
migrations/                 versioned SQL (schema, RLS)
scripts/                    migrate, pilot grant, operator grant, demo seed
worker/index.ts             worker entry point
src/server/
  db/                       postgres client, withUser() RLS transactions
  env.ts                    validated configuration
  auth/                     password hashing, session cookies (Next only)
  monitoring/               url-safety (SSRF), fetcher, robots, render, queue, pipeline, runner, maintenance
  detection/                extract (normalize), pricing, diff (classification)
  ai/                       schema, prompt, provider abstraction, deterministic fallback, facts
  services/                 accounts, competitors, discovery, changes, insights, alerts, reports, compare, search, organization, dashboard, ops
  billing/                  plans, entitlements, stripe
  email/                    provider abstraction + delivery log
  reports/pdf.tsx           PDF rendering
  demo/                     fictional fixtures + seeder
src/app/                    Next.js routes (landing, auth, onboarding, /app/[ws]/…, API)
src/components/             UI primitives (ui/) and product components (app/)
tests/                      unit, integration (Postgres), e2e (Playwright), fixtures
```

## Data model

All tenant tables carry `organization_id` and are covered by RLS.

| Table | Purpose |
| --- | --- |
| `users`, `sessions`, `password_reset_tokens` | Identity. Sessions and tokens are stored as SHA-256 hashes. `password_hash` is not readable by the app role. |
| `organizations`, `memberships`, `invitations` | Tenancy. Roles: `owner`, `member`. |
| `client_workspaces` | Per-client separation inside an organization, with branding and check frequency. |
| `competitors`, `monitored_pages` | What to watch. Pages track health, last attempt vs. last success, conditional-request validators, counts. |
| `monitoring_jobs`, `monitoring_attempts` | Durable queue and the outcome of every attempt (success or failure class). |
| `snapshots` | Immutable normalized content + hash; `pinned` when used as evidence. |
| `detected_changes` | Verified change records: snapshot pair, category, severity, confidence, method, evidence JSON, fingerprint, review/feedback. |
| `change_suppressions` | Content patterns users marked irrelevant/incorrect (feedback loop). |
| `ai_insights` | Change analyses and themes with observed facts, interpretation, actions, uncertainty, source change IDs, model, tokens, cost, cache hash. |
| `alerts`, `notification_preferences`, `email_deliveries` | Notifications and an honest delivery log (`sent` / `failed` / `skipped_not_configured`). |
| `report_definitions`, `generated_reports` | Report configs and frozen, versioned outputs. |
| `comparison_criteria`, `comparison_values` | Custom benchmarking rows with value source (claim / validated / note). |
| `plans`, `subscriptions`, `stripe_events` | Billing state and webhook idempotency. |
| `usage_events`, `audit_logs` | Cost/usage accounting and audit trail. |
| `rate_limits`, `domain_state` | System tables (rate limiting, robots cache, per-origin politeness). Not accessible to the app role. |

Soft deletion is used only where history matters (competitors are `archived`, pages `removed`, workspaces `archived_at`). Organizations and accounts are hard-deleted on request.

## Request flow (example: “Check now”)

1. Server action validates input and rate limits (1 per page per 10 min, 30 per user per hour).
2. In an RLS transaction it verifies the page belongs to the workspace and enqueues a `manual` job (idempotent per minute; at most one active job per page).
3. After commit, the web server claims that specific job with the same lock the worker uses and runs the pipeline inline (static pages only). Browser-rendered pages wait for the worker.
4. The result is reported to the user truthfully (e.g. “blocked by robots.txt”, “no changes”, “change detected”).

## Assumptions

- Daily scheduling is the default and the minimum interval on all plans (configurable per plan in code).
- One organization can have several owners; only owners manage billing and members.
- End-client logins are out of scope; workspaces are the boundary at which such access could be added (add a `workspace_members` table and extend policies to `workspace_id`).
- Prices in plans are launch hypotheses in EUR; Stripe Price IDs are configured per environment.
