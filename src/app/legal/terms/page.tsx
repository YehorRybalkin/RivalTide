import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="[DATE]">
      <p>These Terms govern your use of RivalTide, provided by [LEGAL ENTITY NAME].</p>
      <h2>1. The service</h2>
      <p>RivalTide monitors publicly accessible web pages that you select, on a schedule, and reports detected changes. Monitoring is not real-time. Detection may be incomplete or delayed, and pages may become inaccessible.</p>
      <h2>2. Acceptable use</h2>
      <ul>
        <li>Only add pages that are publicly accessible and that you are permitted to monitor.</li>
        <li>Do not use RivalTide to access private, authenticated, or paywalled content, or to circumvent technical restrictions.</li>
        <li>Respect copyright and applicable law when using or sharing monitored content and reports.</li>
      </ul>
      <h2>3. AI-generated interpretation</h2>
      <p>Optional AI interpretations are provided for information only. They may be inaccurate and are not professional advice. Observed facts are derived from stored evidence; you are responsible for decisions you make.</p>
      <h2>4. Plans, trials and billing</h2>
      <p>[Describe trial terms, billing cycle, cancellation, refunds, taxes and price changes. Plan limits are enforced per organization.]</p>
      <h2>5. Liability</h2>
      <p>[Limitation of liability and warranty disclaimer — requires legal review.]</p>
      <h2>6. Termination</h2>
      <p>[Termination and data deletion terms.]</p>
      <h2>7. Governing law</h2>
      <p>[Jurisdiction.]</p>
    </LegalPage>
  );
}
