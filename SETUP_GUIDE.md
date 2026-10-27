# RivalTide — Setup & Test Guide

A step-by-step guide to get RivalTide running on your machine, run every automated test, and manually test each feature. Plan on about 30 minutes for setup and 45–60 minutes for the full manual walkthrough.

Contents

1. [Prerequisites](#1-prerequisites)
2. [Get the code](#2-get-the-code)
3. [Set up PostgreSQL](#3-set-up-postgresql)
4. [Configure environment variables](#4-configure-environment-variables)
5. [Create the database schema](#5-create-the-database-schema)
6. [Run the app and the worker](#6-run-the-app-and-the-worker)
7. [Run the automated tests](#7-run-the-automated-tests)
8. [Manual test walkthrough](#8-manual-test-walkthrough)
9. [Test with real websites](#9-test-with-real-websites)
10. [Test the optional integrations (AI, email, Stripe)](#10-test-the-optional-integrations)
11. [Troubleshooting](#11-troubleshooting)
12. [Reset and clean up](#12-reset-and-clean-up)

---

## 1. Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 20.9 or newer (22 recommended) | `node -v` |
| npm | comes with Node | `npm -v` |
| PostgreSQL | 15 or newer (16 recommended) — local install, Docker, or Supabase | `psql --version` |
| Git | any recent | `git --version` |
| Docker (optional) | any recent | `docker -v` |

Operating systems: macOS and Linux work directly. On Windows, use **WSL 2** (Ubuntu) and run every command inside WSL.

---

## 2. Get the code

```bash
git clone <your-repo-url> RivalTide
cd RivalTide
git checkout claude/youthful-archimedes-l580lm
npm install
```

`npm install` also installs the Playwright library. Download its browser once (needed for end-to-end tests and for JavaScript-rendered pages):

```bash
npx playwright install chromium
# Linux only, if Chromium complains about missing system libraries:
npx playwright install --with-deps chromium
```

---

## 3. Set up PostgreSQL

You need **three databases**:

| Database | Used by |
| --- | --- |
| `rivaltide` | the app you use day to day |
| `rivaltide_test` | unit/integration tests (wiped on every run) |
| `rivaltide_e2e` | end-to-end tests (wiped on every run) |

> The database user must be allowed to **create roles**, because the migration creates a restricted role called `rivaltide_app` that enforces tenant isolation. A local superuser (Options A and B) or Supabase's `postgres` user (Option C) can do this.

### Option A — Docker (easiest)

```bash
docker run -d --name rivaltide-db \
  -e POSTGRES_USER=rivaltide -e POSTGRES_PASSWORD=rivaltide -e POSTGRES_DB=rivaltide \
  -p 5432:5432 postgres:16

# wait ~5 seconds, then create the test databases
docker exec rivaltide-db createdb -U rivaltide rivaltide_test
docker exec rivaltide-db createdb -U rivaltide rivaltide_e2e
```

### Option B — Local PostgreSQL install

macOS (Homebrew):

```bash
brew install postgresql@16 && brew services start postgresql@16
```

Ubuntu/Debian/WSL:

```bash
sudo apt install postgresql && sudo service postgresql start
```

Then create the user and databases:

```bash
# macOS: run psql directly. Linux: prefix with  sudo -u postgres
psql postgres -c "CREATE ROLE rivaltide LOGIN SUPERUSER PASSWORD 'rivaltide';"
createdb -O rivaltide rivaltide        # Linux: sudo -u postgres createdb -O rivaltide rivaltide
createdb -O rivaltide rivaltide_test
createdb -O rivaltide rivaltide_e2e
```

### Option C — Supabase (for the app database only)

1. Create a project at supabase.com.
2. *Project Settings → Database → Connection string* → copy the **Session pooler** or **Direct** URI (port 5432) and fill in your password.
3. Use that URI as `DATABASE_URL` in step 4.

Keep the test databases local (Option A or B): the test suites drop and recreate the whole schema, which you don't want on a hosted project.

Check the connection:

```bash
psql postgres://rivaltide:rivaltide@localhost:5432/rivaltide -c "select 1"
```

---

## 4. Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local`. For local development the minimum is:

```bash
DATABASE_URL=postgres://rivaltide:rivaltide@localhost:5432/rivaltide
APP_URL=http://localhost:3000
EMAIL_PROVIDER=log
AI_PROVIDER=anthropic          # no key set → rule-based insights (fine for testing)

# Local testing only — lets RivalTide monitor the bundled fixture website on 127.0.0.2.
# NEVER set this in production (the app refuses to start if NODE_ENV=production).
MONITOR_ALLOW_PRIVATE_HOSTS=127.0.0.2
# Local testing only — removes the 10-second gap between requests to the same site.
MONITOR_DOMAIN_INTERVAL_MS=0
```

What happens without the optional keys:

| Missing | Behaviour |
| --- | --- |
| AI key | Insights are rule-based and labeled "Rule-based" |
| Email provider | Emails are printed in the terminal running the app/worker and recorded as *not sent*; the UI says email isn't configured |
| Stripe keys | Checkout buttons are disabled; no payments possible |

### macOS only: enable the 127.0.0.2 loopback address

The fixture website and the tests use `127.0.0.2`. Linux handles this automatically; macOS doesn't. Run once per reboot:

```bash
sudo ifconfig lo0 alias 127.0.0.2 up
```

---

## 5. Create the database schema

```bash
npm run db:migrate
```

Expected output:

```
Applied 0001_core_schema.sql
Applied 0002_row_level_security.sql
Migrations up to date.
```

Optional sanity check that tenant isolation is active:

```bash
psql "$DATABASE_URL" -c "select rolname from pg_roles where rolname='rivaltide_app';" \
                     -c "select relrowsecurity from pg_class where relname='competitors';"
```

You should see `rivaltide_app` and `t` (true). (If `$DATABASE_URL` isn't exported in your shell, paste the URL instead.)

---

## 6. Run the app and the worker

Use three terminals, all in the project folder.

**Terminal 1 — web app**

```bash
npm run dev
```

Open http://localhost:3000. You should see the landing page.

**Terminal 2 — background worker** (scheduled checks, digests, themes, cleanup)

```bash
npm run worker
```

It prints JSON log lines such as `{"msg":"worker started",...}`. Leave it running.

**Terminal 3 — fixture "competitor" website** (for the manual tests in section 8)

```bash
node tests/fixtures/site.mjs
# → fixture site on http://127.0.0.2:4599
```

The fixture site is a fictional company, "Fixture Analytics", with pages `/`, `/pricing`, `/features`, `/blog`, and a `robots.txt` that blocks `/private`. You switch its content between two versions to simulate a competitor changing their site:

```bash
curl "http://127.0.0.2:4599/__version?v=1"   # original: Growth plan €29/month
curl "http://127.0.0.2:4599/__version?v=2"   # changed:  Growth plan €39/month + new headline
```

Health check: http://localhost:3000/api/health → `{"ok":true}`.

---

## 7. Run the automated tests

### 7.1 Type check

```bash
npm run typecheck
```

Expected: no output, exit code 0.

### 7.2 Unit + integration tests (Vitest)

Needs the `rivaltide_test` database. It is wiped and re-migrated automatically.

```bash
npm test                     # everything (expected: 127 passed)
npm run test:unit            # pure logic only — no database needed
npm run test:integration     # database + local fixture servers
```

Using a different database? Set `TEST_DATABASE_URL=postgres://...` before the command.

What they cover: URL safety and blocking private addresses, page cleaning and noise removal, price extraction, change classification, plan limits, alert rules, AI safety, robots.txt rules, tenant isolation, the full monitoring pipeline, failures, duplicates, reports, demo isolation, billing and email boundaries. See [TESTING.md](TESTING.md) for the full map.

### 7.3 End-to-end tests (Playwright)

Needs the `rivaltide_e2e` database and the Chromium download from step 2.

**Stop `npm run dev` first.** Both dev servers use the same build folder and will conflict. You can leave the worker and fixture site running.

```bash
npm run test:e2e             # expected: 4 passed (about 1 minute)
```

Playwright starts its own fixture site and app (on port 3100), resets `rivaltide_e2e`, and runs:

1. Sign up → organization → add competitor → choose pages → baseline → competitor changes price → "Check now" → change detected → evidence → feedback → report → PDF download
2. A second user gets a 404 on the first user's workspace
3. Onboarding rejects a cloud-metadata address (`169.254.169.254`)
4. The demo shows clearly labeled fictional data

On failure, open the recorded trace:

```bash
npx playwright show-trace test-results/<failed-test-folder>/trace.zip
```

Using a different database? Set `E2E_DATABASE_URL=postgres://...`.

### 7.4 Production build

```bash
npm run build
```

Expected: `✓ Compiled successfully` and a route list. The build does not need a database connection.

### 7.5 One command for the quick checks

```bash
npm run check        # typecheck + unit/integration tests
```

---

## 8. Manual test walkthrough

Prerequisites: sections 4–6 done, with all three terminals running (app, worker, fixture site), and the fixture site on version 1:

```bash
curl "http://127.0.0.2:4599/__version?v=1"
```

Tick each step as you go. **Expected** describes what you should see.

### A. Landing page & demo

| # | Step | Expected |
| --- | --- | --- |
| A1 | Open http://localhost:3000 | Hero "Know What Your Competitors Do…", product preview labeled *Demo data*, sections: How it works, Features, Agencies, Pricing (€19 / €49 / €129), FAQ, footer links |
| A2 | Toggle the sun/moon/monitor icons (top right) | Light / dark / system theme switch |
| A3 | Resize to phone width (or browser dev tools → mobile) | Layout stacks; no horizontal scrolling |
| A4 | Click **Explore Live Demo** | Within a few seconds you land on a dashboard with an orange banner: "Demo workspace — all companies, prices and changes are fictional…" |
| A5 | Browse Overview, Competitors, Change history, Insights, Compare, Reports | Four fictional competitors (Northstar Analytics, BeaconMetrics, Flowboard, SignalStack), pricing changes, an "Emerging theme", a comparison matrix with "Not available" cells, two sample reports |
| A6 | Open a report → **Download PDF** | The PDF starts with "SAMPLE REPORT — generated from fictional demo data" |
| A7 | Try to add a competitor (Competitors page) | There is no Add button; the demo is read-only |
| A8 | Account menu (bottom left) → **Leave demo** | Back to the sign-in page |

### B. Sign up & onboarding

| # | Step | Expected |
| --- | --- | --- |
| B1 | http://localhost:3000/signup → fill in name, email (any, e.g. `you@example.com`), password ≥10 characters, tick terms → **Create account** | Redirect to "Create your organization" |
| B2 | Submit with a 5-character password (on a new signup) | Error "Use at least 10 characters" |
| B3 | Choose **Agency or consultant**, organization "Brightwave Marketing", workspace "Client: Acme", client name "Acme" → **Continue** | "Add your first competitor" with a progress list on the left |

### C. Add a competitor & first snapshot

| # | Step | Expected |
| --- | --- | --- |
| C1 | Website URL: `http://127.0.0.2:4599` → **Check website & suggest pages** | "Choose pages to monitor" listing Homepage, Pricing, Features, Blog. Name pre-filled "Fixture Analytics" |
| C2 | Keep only **Homepage** and **Pricing** ticked → **Start monitoring** | Competitor page: green banner "Monitoring is set up — 2 of 2 pages have a baseline snapshot…". Both pages show **Healthy**, Checks = 1 "baseline only" |
| C3 | Check "Recent changes" | "No changes yet…" — no change is ever claimed from a single snapshot |
| C4 | Go to **Overview** | Stats show 1 competitor and 2 active pages, plus a blue notice "2 pages are still building a baseline" |

### D. Detect a change (manual check)

| # | Step | Expected |
| --- | --- | --- |
| D1 | In terminal 3 (or any terminal): `curl "http://127.0.0.2:4599/__version?v=2"` | `version=2` |
| D2 | Competitor page → Pricing row → **Check now** | Toast "Check finished: change detected." |
| D3 | Homepage row → **Check now** | Toast "Check finished: change detected." (the headline changed) |
| D4 | Click **Check now** on Pricing again | Error: manual checks are limited to one every 10 minutes per page |
| D5 | Note that the fixture homepage prints the current time on every load | That timestamp never counts as a change; it's filtered as noise |

### E. Evidence & review

| # | Step | Expected |
| --- | --- | --- |
| E1 | **Change history** | Two changes: Pricing (High) "Growth plan monthly price increased from €29 to €39" and Positioning (Medium) "Headline changed from…" |
| E2 | Try the filters (category, severity, read/unread, dates) → **Apply filters** | The list narrows; **Clear** resets it |
| E3 | Open the pricing change | "Parsed pricing changes" (amount changed, high confidence); **Before vs after** with €29 in red and €39 in green; Evidence record with source page, detection time, and previous/new snapshot links and hashes |
| E4 | Click a snapshot link | The cleaned page text as stored; cookie banner text is absent |
| E5 | Analysis panel | "Observed facts (from evidence)", Interpretation, Actions to consider, Uncertainty; badge **Rule-based**; notice that AI isn't configured |
| E6 | Click **Relevant** | Toast "Thanks — marked as relevant." |
| E7 | Open the headline change → **Irrelevant** | Toast says similar content will be ignored; the change is dismissed (it disappears from the default list; filter Review = "Dismissed" to see it) |
| E8 | **Mark reviewed** / **Dismiss** / **Reopen** on any change | Status badges update |

### F. Insights, compare, search, notifications

| # | Step | Expected |
| --- | --- | --- |
| F1 | **Insights** | One card per change with facts, interpretation, actions, uncertainty. **Save for reports** toggles to "Saved for reports" |
| F2 | **Compare** (needs 2+ competitors; add a second one with C1–C2, e.g. the same site's `/features` under another name — or use the demo) | A matrix showing "Not available" where data is missing and Observed / Competitor claim labels. Add a custom criterion, then edit a cell via the pencil icon. **Export CSV** downloads a file |
| F3 | Search box (top bar, or ⌘K / Ctrl+K) → "Fixture" | Results grouped by Competitors, Monitored pages, Changes, Insights |
| F4 | Bell icon | Alerts for the material changes, plus a notice that email delivery isn't configured. **Mark all as read** clears the red badge |
| F5 | Terminal running `npm run dev` | `[email:stub] to=… subject="[RivalTide] Fixture Analytics: Pricing"` — the email was logged, not sent |

### G. Reports

| # | Step | Expected |
| --- | --- | --- |
| G1 | **Reports** → Weekly competitive brief, Last 7 days → **Generate report** | The report page shows Executive summary, Monitoring coverage (with the "Coverage is limited…" note), Pricing developments, Strategic interpretation, Source appendix |
| G2 | **Download PDF** | A paginated PDF with page numbers |
| G3 | Generate a **Competitor deep dive** (choose Fixture Analytics) and an **Agency client report** | Different section layouts; the client report title includes the client name |
| G4 | **Mark final** on a report | Status "final"; the delete button disappears |
| G5 | Frozen evidence test: `curl "http://127.0.0.2:4599/__version?v=1"`, wait 10 minutes (or use step H2 to run a scheduled check), then reopen the earlier report | The report still shows €29 → €39 and its sha256 hash is unchanged |

### H. Background worker (scheduled monitoring, no browser needed)

| # | Step | Expected |
| --- | --- | --- |
| H1 | Make every page due now: `psql "$DATABASE_URL" -c "update monitored_pages set next_check_at = now();"` | `UPDATE n` |
| H2 | Watch terminal 2 (`npm run worker`), or stop it and run `npm run worker:once` | Log lines `"msg":"job" … "outcome":"changed"` (or `"unchanged"`) for each page |
| H3 | Reload the competitor page | "Last successful fetch" updated; Checks incremented |
| H4 | Repeat H1–H2 without changing the site version | `"outcome":"unchanged"` — no new change, no new alert |
| H5 | Flip back and forth: v1 → check → v2 → check | The repeated identical change (back to v2) is deduplicated and doesn't alert again |

### I. Failure handling (failures must never become "changes")

| # | Step | Expected |
| --- | --- | --- |
| I1 | Competitor page → **Add a page**: `http://127.0.0.2:4599/private` | Toast "First check: blocked by robots.txt"; status **Access restricted**; the page was never fetched |
| I2 | Add `http://127.0.0.2:4599/does-not-exist` | Status **Delayed**, detail "HTTP 404". After 3 consecutive failures it shows **Failed** |
| I3 | Stop the fixture site (Ctrl+C in terminal 3), then run H1–H2 | Pages show **Delayed** with a network error; Change history gets nothing new |
| I4 | Add a competitor with URL `http://169.254.169.254/latest/meta-data/` | "This address is private or reserved" |
| I5 | Try `http://localhost:5432`, `file:///etc/passwd`, `http://10.0.0.1` | Each is rejected |
| I6 | Add a page from a different domain to Fixture Analytics (e.g. `https://example.org/`) | "…is not on the competitor's website" |
| I7 | **Pause monitoring** on the competitor | Pages show **Paused**; H1–H2 doesn't check them. **Resume monitoring** restores them |

Restart the fixture site afterwards: `node tests/fixtures/site.mjs`.

### J. Team, workspaces, settings

| # | Step | Expected |
| --- | --- | --- |
| J1 | **Settings → Organization & team** → invite `teammate@example.com` | Notice "Email is not configured… share this link" with an `/invite/…` URL |
| J2 | Open that link in a private window → **Create an account** with *exactly* that email → **Accept invitation** | The teammate sees the organization's workspaces; the owner's member list shows them as Member |
| J3 | As the teammate, open Settings → Organization & team | No invite or remove controls ("Only organization owners…") |
| J4 | As the owner: **Settings → Client workspaces** → create "Client: Lumen" | You're taken to add a competitor in the new workspace. The workspace switcher (top left) lists both workspaces, and their data is separate |
| J5 | **Agency overview** (sidebar) | One row per client workspace with competitors, changes, issues, drafts |
| J6 | **Settings → Notifications** → "Pricing changes only", digest Weekly → Save | Toast "Notification preferences saved." |
| J7 | **Settings → This workspace** → check frequency, branding | Branding fields are enabled on the Agency plan (see K3), disabled otherwise |
| J8 | **Settings → Account** → change your name and password | Toasts confirm; sign out and back in with the new password |

### K. Plans, limits and billing boundary

Find your organization's ID first:

```bash
psql "$DATABASE_URL" -c "select o.id, o.name, s.plan_id, s.status, s.is_paid from organizations o join subscriptions s on s.organization_id=o.id where not o.is_demo;"
```

| # | Step | Expected |
| --- | --- | --- |
| K1 | **Settings → Plan & billing** | "Free trial", badge "Not billed", usage meters, a notice that online checkout isn't enabled, plan buttons disabled |
| K2 | Switch to Starter: `psql "$DATABASE_URL" -c "update subscriptions set plan_id='starter' where organization_id='<ORG_ID>';"` → reload a report | **PDF (Growth+)** is locked; adding a 6th competitor or a 16th page fails with a plan-limit message |
| K3 | Grant an Agency pilot: `npm run pilot:grant -- --email you@example.com --plan agency --days 30` | Billing shows "Pilot (unpaid)"; white-label branding is enabled. Brand name and colour appear on newly generated reports/PDFs |
| K4 | Expire the plan: `psql "$DATABASE_URL" -c "update subscriptions set status='trialing', trial_ends_at=now()-interval '1 day' where organization_id='<ORG_ID>';"` | A yellow bar says the plan is expired and monitoring is paused; adding competitors fails; H1–H2 checks nothing |
| K5 | Restore: rerun K3 | Everything works again |

### L. Password reset

| # | Step | Expected |
| --- | --- | --- |
| L1 | Sign out → **Forgot your password?** → enter your email | "If an account exists…" plus a notice that email isn't configured |
| L2 | In the `npm run dev` terminal, find `[email:stub] … subject="Reset your RivalTide password"` and copy the `/reset-password?token=…` link | — |
| L3 | Open the link, set a new password | You're sent to sign in with "Your password was updated"; all other sessions are signed out |
| L4 | Reuse the same link | "This reset link is invalid or has expired." |

### M. Security spot checks

| # | Step | Expected |
| --- | --- | --- |
| M1 | Copy your workspace URL (`/app/<uuid>`), sign in as a *different* user (not a member), open it | 404 page |
| M2 | Enter a wrong password 9+ times for one email within 15 minutes | "Too many sign-in attempts…" |
| M3 | Sign in with `?next=https://evil.example` (e.g. `/login?next=https://evil.example`) | After sign-in you stay on RivalTide (`/app`) |
| M4 | Database-level isolation (optional): `npm run test:integration -- tenancy` | 6 tests pass |

### N. Operator dashboard

```bash
npm run operator:grant -- you@example.com
```

Reload the app. A new **Operations** item appears in the sidebar, showing queue status, fetch success rate, attempt outcomes, usage, estimated AI cost, email counts, storage, and recent failures.

### O. JavaScript-rendered pages (optional)

1. Add `MONITOR_BROWSER_ENABLED=true` to `.env.local` and restart the worker and app.
2. Make sure the plan is Growth or higher (trial/pilot counts).
3. Competitor page → Add a page → *Fetching: JavaScript rendering* → e.g. `http://127.0.0.2:4599/features`.
4. The web app queues it ("baseline check is queued"); the **worker** renders it with Chromium. After H2 the page shows **Healthy**, with a "JS render" badge.

---

## 9. Test with real websites

The fixture setup proves the pipeline works. Before launch, also monitor at least one real public page you're permitted to monitor:

1. In `.env.local`, **remove** `MONITOR_ALLOW_PRIVATE_HOSTS` and set `MONITOR_DOMAIN_INTERVAL_MS=10000` (the production default). Restart the app and worker.
2. Add a competitor with a public site (e.g. your own company's website or a site you have permission to monitor).
3. Check that the suggestions are sensible, the baseline is **Healthy**, and the page title and description were read.
4. Run H1–H2 the next day (or immediately): expect `unchanged` unless the site really changed. Review any detected change for false positives (rotating content, dates) and use **Irrelevant** to suppress them.
5. Add a page you know is disallowed in that site's `robots.txt` → expect **Access restricted**.

Your machine needs normal internet access. Corporate proxies/firewalls that block outbound requests will show up as **Delayed / network error**.

---

## 10. Test the optional integrations

### AI analysis (Anthropic or OpenAI)

```bash
# .env.local
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# AI_MODEL=claude-haiku-5-5     # optional, much cheaper; default is claude-opus-5-5
```

Restart the app and worker. Open a **medium or high** change → **Re-run analysis**. The badge changes to "AI · <model>". Observed facts stay identical (they always come from evidence); interpretation and actions are AI-written and hedged. The Operations page shows AI tokens and estimated cost. A trial includes 25 AI analyses per month. Low-severity or "needs review" changes always use the rule-based summary.

OpenAI: `AI_PROVIDER=openai`, `OPENAI_API_KEY=...`, optional `AI_MODEL`.

### Email (Resend)

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM="RivalTide <alerts@your-verified-domain.com>"
```

Restart. Trigger a password reset (L1) and a pricing change (D1–D2, on a Growth/trial/pilot plan with email enabled). Emails arrive; `select status from email_deliveries order by created_at desc limit 5;` shows `sent`.

### Stripe (test mode only)

1. In the Stripe dashboard (test mode), create three recurring monthly EUR prices: €19, €49, €129.
2. Install the Stripe CLI and run: `stripe listen --forward-to localhost:3000/api/stripe/webhook` — copy the `whsec_…` secret it prints.
3. Add to `.env.local`:
   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_STARTER=price_...
   STRIPE_PRICE_GROWTH=price_...
   STRIPE_PRICE_AGENCY=price_...
   ```
4. Restart the app. **Settings → Plan & billing** → **Choose Growth** → pay with test card `4242 4242 4242 4242`, any future date, any CVC.
5. Expected: you return to the billing page; within seconds the plan shows **Active** with a **Paid** badge (`stripe listen` shows the events with `200`).
6. **Manage billing** opens the Stripe portal. Cancel → after the webhook, the status updates (cancel at period end, then *Canceled* when Stripe ends it).
7. Failed payment: `stripe trigger invoice.payment_failed` → the status becomes "Payment failed — retrying" and the service keeps running.

---

## 11. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Invalid environment configuration: DATABASE_URL…` | `.env.local` is missing or not in the project root |
| `permission denied to create role` during migrate | Use a superuser locally, or Supabase's `postgres` user |
| `ECONNREFUSED 127.0.0.1:5432` | Postgres isn't running (`docker start rivaltide-db` / `brew services start postgresql@16`) |
| Adding `http://127.0.0.2:4599` says "private or reserved" | `MONITOR_ALLOW_PRIVATE_HOSTS=127.0.0.2` is missing from `.env.local`, or you didn't restart `npm run dev` |
| Fixture site: `EADDRNOTAVAIL 127.0.0.2` (macOS) | `sudo ifconfig lo0 alias 127.0.0.2 up` |
| "Check now" says *queued (politeness delay)* | Set `MONITOR_DOMAIN_INTERVAL_MS=0` for local testing, or wait 10 s and check again |
| Worker logs nothing | No pages are due. Run `update monitored_pages set next_check_at = now();` |
| e2e: port 3100 in use / `.next` lock errors | Stop `npm run dev` and any old `next dev` processes, then rerun |
| e2e: browser executable not found | `npx playwright install chromium` |
| `npm test` fails to connect | Create `rivaltide_test`, or set `TEST_DATABASE_URL` |
| Demo button redirects back with no demo | Rate limit: 6 demos per hour per network. Wait, or run `npm run db:reset` locally |
| Changes in `.env.local` have no effect | Restart both `npm run dev` and `npm run worker` |

---

## 12. Reset and clean up

```bash
npm run db:reset             # drop & recreate the schema in DATABASE_URL (refuses in production)
docker rm -f rivaltide-db    # remove the Docker database (Option A)
rm -rf .next test-results    # build output and test artifacts
```

Demo accounts delete themselves after 24 hours. The worker's daily maintenance removes old snapshots (default retention 180 days), finished jobs, expired sessions, and expired demos.

---

For production deployment (Supabase + Vercel + worker container, Resend, Stripe live mode, and the go-live checklist) see [DEPLOYMENT.md](DEPLOYMENT.md).
