# Deployment

Recommended production topology:

| Component | Where | Notes |
| --- | --- | --- |
| PostgreSQL | Supabase (or any managed Postgres 15+) | Migrations create a `rivaltide_app` role and RLS policies |
| Web app | Vercel (or any Node host / the Docker image) | Next.js 16, Node runtime |
| Worker | A container host that runs long-lived processes: Fly.io, Railway, Render, ECS, a VM | Uses the included `Dockerfile` (Playwright base image with Chromium) |
| Email | Resend (optional) | Alerts, digests, invitations, password resets |
| AI | Anthropic or OpenAI (optional) | Server-side only |
| Billing | Stripe (optional) | Checkout disabled until fully configured |

Vercel serverless functions are **not** used for scheduled monitoring or browser rendering. A cron fallback endpoint exists for very small deployments (see below), but the worker is the supported path.

## 1. Database (Supabase)

1. Create a Supabase project. Copy the connection string from *Project Settings → Database*.
   - Worker and migrations: use the **direct** or **session pooler** connection (port 5432).
   - Web app on serverless: the **transaction pooler** (port 6543) is fine; set `DATABASE_PREPARE=false`.
2. Run migrations from your machine or CI (requires a role that can create roles — the default `postgres` user can):
   ```bash
   DATABASE_URL="postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres" npm run db:migrate
   ```
3. Verify: `select rolname from pg_roles where rolname = 'rivaltide_app';` returns one row, and `select relrowsecurity from pg_class where relname = 'competitors';` is `true`.

Supabase Auth, Storage and the Data API are not used. The migration revokes `anon`/`authenticated` table privileges as a precaution.

## 2. Web app (Vercel)

1. Import the repository. Framework preset: Next.js. Build command `npm run build`.
2. Environment variables (Production): `DATABASE_URL`, `DATABASE_PREPARE=false` (if using the pooler), `APP_URL=https://your-domain`, plus optional AI/email/Stripe variables from `.env.example`.
3. Do **not** set `MONITOR_ALLOW_PRIVATE_HOSTS`.
4. After deploy: `GET /api/health` → `{"ok":true}`.

The web app runs baseline and manual checks inline for standard (static HTML) pages so new users see results immediately. Set the same `MONITOR_*` variables as the worker if you change defaults.

## 3. Worker

Build and run the container:

```bash
docker build -t rivaltide-worker .
docker run -d --name rivaltide-worker --restart unless-stopped \
  -e DATABASE_URL=... -e APP_URL=https://your-domain \
  -e EMAIL_PROVIDER=resend -e RESEND_API_KEY=... -e EMAIL_FROM="RivalTide <alerts@your-domain>" \
  -e ANTHROPIC_API_KEY=... \
  rivaltide-worker
```

Fly.io example: `fly launch --no-deploy`, set secrets with `fly secrets set DATABASE_URL=... APP_URL=...`, then `fly deploy`. Run a single machine with 1 GB+ RAM (Chromium). Scale horizontally by running more workers — claiming is concurrency-safe.

Worker settings: `WORKER_CONCURRENCY` (default 4), `WORKER_POLL_MS` (5000), `MONITOR_BROWSER_ENABLED` (true in the image), `MONITOR_DOMAIN_INTERVAL_MS` (10000).

Security recommendation: place the worker in a network without access to internal services or cloud metadata endpoints (defense in depth on top of the SSRF controls).

The worker also sends digests (every 15 min check), computes emerging themes (6h), and runs retention cleanup (daily). It shuts down gracefully on SIGTERM.

### Cron fallback (small deployments only)

Set `CRON_SECRET` and call `GET /api/cron/monitor` with `Authorization: Bearer <CRON_SECRET>` (e.g. Vercel Cron every 15 minutes). Each call processes up to 5 static checks. Browser rendering, digests, themes and retention cleanup require the worker (`npm run worker:once` can also be run from any scheduler).

## 4. Email (Resend)

1. Verify your sending domain in Resend.
2. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` on both web app and worker.
3. Deliveries are logged in `email_deliveries` (status `sent`/`failed`, retries for 429/5xx). Without configuration the status is `skipped_not_configured` and the UI says email is not configured.

## 5. AI

- Anthropic: `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, optional `AI_MODEL` (default `claude-opus-5-5`; `claude-haiku-5-5` is the low-cost option). Requests use structured outputs, `effort: low`, and server-side refusal fallback.
- OpenAI: `AI_PROVIDER=openai`, `OPENAI_API_KEY`, optional `AI_MODEL` (default `gpt-5-mini`).
- Allowance per plan: Growth 100, Agency 400 analyses/month (trial 25). Only medium/high-severity, classified changes use AI.
- Cost estimates use the table in `src/server/ai/provider.ts` — update it if your prices differ. Verify against provider invoices.
- Before enabling for customers, trigger one analysis (change page → *Re-run analysis*) and inspect output on the Operations page.

## 6. Stripe

1. Create three recurring Prices (EUR monthly): Starter €19, Growth €49, Agency €129 (launch hypotheses).
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_AGENCY` on the web app.
3. Add a webhook endpoint `https://your-domain/api/stripe/webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`; set `STRIPE_WEBHOOK_SECRET`.
4. Enable the Customer Portal in Stripe (cancellation, payment method updates, invoices).
5. Test end to end in **test mode** (`stripe listen --forward-to localhost:3000/api/stripe/webhook`) before using live keys: checkout success, cancellation at period end, failed payment (`past_due` keeps service during retries), deletion (`canceled` → monitoring stops).

Checkout buttons stay disabled until all Stripe variables are set. Pilots: `npm run pilot:grant -- --email owner@agency.com --plan agency --days 60` (never marked as paid; ignored if a paid Stripe subscription is active).

## 7. Operator access

`npm run operator:grant -- you@company.com` enables `/app/<workspace>/ops` (cross-tenant reliability and cost metrics) for that user.

## Go-live checklist

- [ ] `npm run typecheck && npm test` and `npm run test:e2e` pass in CI
- [ ] Migrations applied; RLS verified (see step 1)
- [ ] `APP_URL` correct; cookies are `Secure` (production)
- [ ] `MONITOR_USER_AGENT` points to your `/bot` page and domain
- [ ] Worker running; `/ops` shows jobs succeeding; no expired leases
- [ ] **Monitor one real, permitted public page end to end**: add it, confirm baseline, wait for (or trigger) a second check, confirm "unchanged" and correct health; confirm a robots-disallowed page shows *Access restricted*
- [ ] Email domain verified and a password-reset email received
- [ ] One AI analysis inspected (if AI enabled)
- [ ] Stripe test-mode flows verified (if billing enabled)
- [ ] Legal templates reviewed by counsel; security contact added
- [ ] Error monitoring configured (Sentry or equivalent: add the SDK and set `SENTRY_DSN`; not bundled by default)
- [ ] Database backups enabled (Supabase PITR or equivalent)

## Cost drivers (no vendor prices assumed)

| Driver | Scales with | Levers |
| --- | --- | --- |
| Worker compute | pages × checks/day; browser-rendered pages cost far more than static fetches | daily schedule, conditional requests, opt-in rendering, `WORKER_CONCURRENCY` |
| Database storage | snapshots (only stored when content changes) and attempt logs | `SNAPSHOT_RETENTION_DAYS`, normalized (not raw HTML) storage |
| AI tokens | material changes × analyses | plan allowances, input cap `AI_MAX_INPUT_CHARS`, caching by input hash, model choice |
| Email | alerts + digests | per-user daily cap, digests, preferences |
| Bandwidth | page size × checks | 3 MB cap, 304 responses |

The Operations page shows fetches, failures, renders, AI tokens with estimated cost, and email counts for the last 30 days.

## Known limitations

- Real-website monitoring was not exercised from the build environment (outbound network was restricted); see the go-live checklist.
- The Dockerfile has not been built in the development environment (no Docker daemon); build and smoke-test it once (`docker run … npm run worker:once`).
- Supabase Auth is not used (see ARCHITECTURE.md for the rationale and migration path).
- No end-client logins; reports are shared as PDFs.
- Monitoring frequency is daily by default; there is no real-time detection.
- Sentry is an integration point, not bundled.
- CSP permits inline scripts (Next.js requirement without nonces).
