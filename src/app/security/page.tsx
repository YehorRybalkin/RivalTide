import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Security & privacy overview" };

export default function SecurityPage() {
  return (
    <LegalPage title="Security & privacy overview" updated="2026-10-26" draft={false}>
      <p>This page describes how RivalTide is built. It is a technical overview, not a certification — RivalTide has not been audited against any compliance framework.</p>
      <h2>Tenant isolation</h2>
      <ul>
        <li>Every organization-owned record carries an organization ID and is protected by PostgreSQL row-level security policies.</li>
        <li>Application queries run as a restricted database role inside a per-request transaction bound to the signed-in user, in addition to server-side authorization checks.</li>
        <li>Agency client workspaces are separated within an organization; reports only include data from their own workspace.</li>
      </ul>
      <h2>Accounts and sessions</h2>
      <ul>
        <li>Passwords are hashed with scrypt. Session tokens are random, stored only as hashes, and sent in HttpOnly, SameSite cookies.</li>
        <li>Sign-in, sign-up and password reset are rate limited. Password resets invalidate existing sessions.</li>
      </ul>
      <h2>Responsible monitoring</h2>
      <ul>
        <li>RivalTideBot identifies itself, honours robots.txt (including crawl-delay), and applies per-domain request spacing with exponential backoff.</li>
        <li>It never bypasses logins, paywalls, CAPTCHAs or bot protection, and does not rotate identities.</li>
        <li>Outbound requests are protected against server-side request forgery: only http(s), no credentials in URLs, no private, loopback, link-local or metadata addresses, every redirect re-validated, DNS checked at connection time, and response size and time bounded.</li>
      </ul>
      <h2>AI</h2>
      <ul>
        <li>AI runs only on the server and only after a change is verified deterministically. Monitored page text is treated as untrusted input and isolated from instructions.</li>
        <li>Observed facts shown with an insight come from stored evidence, not from the model.</li>
      </ul>
      <h2>Payments</h2>
      <p>Card details are handled by Stripe and never touch RivalTide servers. Webhooks are signature-verified and processed idempotently.</p>
    </LegalPage>
  );
}
