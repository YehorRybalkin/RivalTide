# Security

This document describes the implemented controls and known limitations. It is not a certification; no external audit has been performed.

## Tenant isolation

- Every tenant-owned table has `organization_id` and PostgreSQL **row-level security** enabled (`migrations/0002_row_level_security.sql`).
- Request-scoped queries run inside `withUser()` (`src/server/db/index.ts`): a transaction that executes `SET LOCAL ROLE rivaltide_app` and sets `app.user_id`. `rivaltide_app` is `NOLOGIN` without `BYPASSRLS`, so policies apply to every statement.
- Policies resolve membership through `SECURITY DEFINER` helpers (`app_user_org_ids()`, `app_is_org_owner()`), avoiding recursive policies.
- Column-level grant: `users.password_hash` is not selectable by the app role. `sessions`, `password_reset_tokens`, `rate_limits`, `domain_state`, `stripe_events` have RLS with no policies and no grants (inaccessible).
- Services additionally scope by `workspace_id` and validate UUIDs; non-member access returns 404.
- Supabase's PostgREST roles (`anon`, `authenticated`) have their table privileges revoked by the migration; RivalTide never uses the Data API.
- Tests: `tests/integration/tenancy.test.ts` (reads/writes without WHERE clauses, cross-tenant workspace access, system tables, membership role escalation, global search) and the e2e cross-tenant 404 test.

System (owner-role) database access is limited to: the worker, authentication bootstrap (sign-up/sign-in/session lookup), Stripe webhooks, email logging, demo seeding, operator metrics, and post-commit jobs that were authorized under RLS first.

## Authentication & sessions

- Passwords: scrypt (N=2^15, r=8, p=1), 16-byte salt, constant-time compare; dummy hash on unknown users to equalize timing.
- Sessions: 256-bit random tokens, stored as SHA-256 hashes, HttpOnly + SameSite=Lax + Secure (production) cookies, 30-day expiry, deleted on sign-out and on password reset.
- Password reset: single-use, 1-hour hashed tokens; same response whether or not the account exists.
- Rate limits (Postgres-backed, work across instances): sign-in per IP and per email, sign-up per IP, reset per IP, demo creation per IP, manual checks, invitations, AI re-analysis.
- Demo users cannot sign in with a password.
- Open-redirect protection on `next` parameters.

## Web application

- Mutations are Next.js Server Actions (built-in Origin/Host check against CSRF) or signature-/secret-verified route handlers (Stripe webhook, cron). GET routes are read-only.
- All input validated with Zod on the server. React escapes output; there is no `dangerouslySetInnerHTML`. URLs rendered as links are validated `http(s)` at input.
- CSV export neutralizes spreadsheet formula injection.
- Security headers (`next.config.ts`): CSP, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy`. **Limitation:** the CSP allows `'unsafe-inline'` scripts because Next.js injects inline bootstrap scripts; tighten with nonces via middleware if required.
- Errors shown to users are generic unless they are deliberate `AppError`s; unexpected errors are logged server-side without request bodies.
- No secrets are sent to the browser; all integrations (AI, email, Stripe) run server-side.

## SSRF and responsible fetching

`src/server/monitoring/url-safety.ts` and `fetcher.ts`:

- Only `http:`/`https:`; no credentials in URLs; ports 80/443/8080/8443 only.
- Rejects `localhost`, `*.localhost`, `.local`, `.internal`, single-label hosts, numeric/hex host encodings, and IP literals in private, loopback, link-local (incl. `169.254.169.254`), CGNAT, multicast, reserved, documentation, NAT64, 6to4, Teredo, ULA ranges — including IPv4-mapped IPv6.
- DNS is resolved and checked **at connect time** through a custom `lookup` on the undici Agent, so DNS rebinding between validation and connection cannot reach internal addresses.
- Redirects are followed manually and each target is re-validated.
- Size (3 MB), time (15 s) and redirect (5) limits; HTML/text content types only.
- Browser rendering validates every sub-request (document, scripts, XHR) and blocks heavy resource types. **Residual risk:** Chromium resolves DNS itself after our pre-check; a rebinding attack in that window is mitigated but not eliminated. Run the worker in a network segment without access to internal services (recommended for any crawler).
- `MONITOR_ALLOW_PRIVATE_HOSTS` exists only for local tests and causes a startup failure when `NODE_ENV=production`.
- robots.txt honored, identifying user agent, per-origin spacing, backoff, no CAPTCHA solving, no paywall/auth bypass, no identity rotation.

## AI safety

- AI runs only server-side, only on changes already verified deterministically, only when configured and within plan allowance.
- Page text is passed inside `<untrusted_page_text>` with explicit instructions never to follow embedded instructions; delimiter tags inside the data are neutralized.
- Output is constrained by a JSON schema (structured outputs) and re-validated with Zod; lengths are bounded and links not present in the source are removed.
- "Observed facts" are generated deterministically from evidence, never by the model. Interpretations are labeled and include uncertainty.
- Timeouts, SDK retries, refusal handling (server-side fallback enabled for Anthropic), and a deterministic fallback on any failure.

## Billing

- Card data never touches RivalTide (Stripe Checkout/Portal).
- Webhooks: signature verified, processed at most once (`stripe_events`), subscription state re-read from the Stripe API rather than trusting event payloads.
- Trials and pilots are never marked as paid (`is_paid` only for Stripe-active subscriptions).

## Logging & privacy

- Structured worker logs contain IDs and outcomes, not page content or personal data.
- Personal data stored: name, email, hashed password, session user agent. IPs are used transiently for rate limiting (keys expire daily).
- Account and organization deletion are self-service (Settings → Privacy & data).

## Reporting vulnerabilities

Add a security contact (e.g. `security@your-domain`) before launch.
