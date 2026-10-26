# Testing

The suites never depend on arbitrary external websites. Fetch-related tests run against local fixture servers bound to `127.0.0.2`, which is allow-listed only for tests via `MONITOR_ALLOW_PRIVATE_HOSTS` (rejected at startup in production).

## Prerequisites

PostgreSQL with two extra databases owned by your dev user:

```bash
createdb rivaltide_test
createdb rivaltide_e2e
```

Override with `TEST_DATABASE_URL` / `E2E_DATABASE_URL` (defaults: `postgres://rivaltide:rivaltide@localhost:5432/rivaltide_test` and `…/rivaltide_e2e`). Both are dropped and re-migrated at the start of each run.

## Commands

```bash
npm run typecheck          # strict TypeScript
npm test                   # unit + integration (Vitest)
npm run test:unit          # pure logic only
npm run test:integration   # requires Postgres
npm run test:e2e           # Playwright: starts a fixture site and `next dev` on :3100
```

E2E uses the Playwright version pinned in `package.json`; install browsers with `npx playwright install chromium` if your machine doesn't have them.

## Coverage map

| Requirement | Tests |
| --- | --- |
| URL validation, SSRF rejection (private/metadata/IPv6-mapped/numeric hosts, credentials, ports, DNS) | `tests/unit/url-safety.test.ts`, discovery test in `tests/integration/monitoring.test.ts`, e2e metadata-address test |
| Content normalization, noise masking, cookie banners, hashing | `tests/unit/extract.test.ts` |
| Pricing extraction (plan, period, billed annually, per seat, one-time, tax, promo, struck prices, no arbitrary numbers, no cross-period/currency comparison) | `tests/unit/pricing.test.ts` |
| Snapshot comparison & categorization (pricing, announcement, positioning, features, nav-only, ambiguous → needs review), fingerprints, suppressions, challenge pages | `tests/unit/diff.test.ts` |
| Plan entitlements & feature gating | `tests/unit/entitlements.test.ts` |
| Alert rules, AI prompt-injection isolation, output sanitization, deterministic fallback with missing AI credentials, robots semantics, CSV injection | `tests/unit/alerts-ai.test.ts` |
| Organization isolation (RLS reads/writes, system tables, password hash column, role escalation, search scoping) | `tests/integration/tenancy.test.ts` |
| Monitoring job execution, baseline, snapshot persistence, unchanged/noise, change record, insight, alert, honest email log | `monitoring.test.ts` › baseline/pricing |
| Duplicate detection & no repeat alerts | `monitoring.test.ts` › flip-flop |
| Blocked (robots), HTTP 500, 403, bot challenge, unsupported content | `monitoring.test.ts` |
| Incorrect/incomplete extraction (content collapse) | `monitoring.test.ts` › extraction collapse |
| User feedback suppression | `monitoring.test.ts` › irrelevant |
| Duplicate scheduled jobs, lease recovery, scheduler skipping paused pages | `monitoring.test.ts` |
| Report generation with frozen evidence | `monitoring.test.ts` › report |
| Demo isolation/read-only, billing boundary (no Stripe), trial expiry, email stub, accounts | `tests/integration/demo-billing.test.ts` |
| Sign up → workspace → competitor → pages → baseline → changed content → evidence → insight → feedback → report → PDF; cross-tenant 404; demo | `tests/e2e/core-flow.spec.ts` |

## Results at the time of writing

- `npm run typecheck`: pass
- `npm test`: 127 passed (8 files)
- `npm run test:e2e`: 4 passed
- `npm run build`: pass

## Manual verification performed

- `npm run worker:once` against a fixture site: baselines, then a pricing change and a headline change detected; a live timestamp on the page was correctly ignored.
- Playwright rendering (`MONITOR_BROWSER_ENABLED=true`) extracted prices from the fixture site and rejected `169.254.169.254`.
- Visual review in light, dark and mobile layouts of the landing page, dashboard, evidence view, comparison matrix, and PDF output.

## Not covered by automated tests

Live AI providers, Resend, Stripe (no credentials in CI), monitoring of real public websites (network-restricted environment), and building the Docker image (no Docker daemon was available; the worker itself was run directly with `npm run worker:once`). See the go-live checklist in DEPLOYMENT.md.
