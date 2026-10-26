import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="[DATE]">
      <p>This Privacy Policy explains how [LEGAL ENTITY NAME] (&quot;RivalTide&quot;, &quot;we&quot;) processes personal data when you use the RivalTide service.</p>
      <h2>1. Data we process</h2>
      <ul>
        <li>Account data: name, email address, hashed password, organization and workspace names.</li>
        <li>Usage data: actions you take in the product (audit log), notification preferences, and technical logs (IP address for rate limiting, browser user agent for session management).</li>
        <li>Monitoring data: content of publicly accessible competitor web pages that you choose to monitor, stored as normalized text snapshots.</li>
        <li>Billing data: if you subscribe, payments are processed by Stripe. We store your Stripe customer and subscription identifiers, not your card details.</li>
      </ul>
      <h2>2. Purposes and legal bases</h2>
      <p>[Describe purposes — providing the service, security, billing, communication — and the applicable legal bases, e.g. performance of contract and legitimate interests. Requires legal review.]</p>
      <h2>3. Processors</h2>
      <p>Depending on configuration: hosting and database provider [e.g. Supabase, Vercel, worker host], email delivery [e.g. Resend], payment processing [Stripe], AI analysis [Anthropic or OpenAI — only the text of verified competitor page changes is sent, never your account data], error monitoring [optional, e.g. Sentry].</p>
      <h2>4. Retention</h2>
      <ul>
        <li>Page snapshots that are not referenced by a detected change or report are deleted after the configured retention period (default 180 days).</li>
        <li>Snapshots that serve as evidence for changes or issued reports are kept while the change or report exists.</li>
        <li>Expired sessions and password-reset tokens are deleted automatically.</li>
        <li>Demo accounts and their fictional data are deleted 24 hours after creation.</li>
      </ul>
      <h2>5. Your rights</h2>
      <p>You can export or delete your data. Deleting your account in Settings → Privacy permanently removes your user record and any organization where you are the only owner. [Describe access, rectification, objection, portability and complaint rights for your jurisdiction.]</p>
      <h2>6. Contact</h2>
      <p>[CONTACT EMAIL / DATA PROTECTION CONTACT]</p>
    </LegalPage>
  );
}
