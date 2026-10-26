import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "RivalTideBot" };

export default function BotPage() {
  return (
    <LegalPage title="About RivalTideBot" updated="2026-10-26" draft={false}>
      <p>RivalTideBot fetches publicly accessible pages on behalf of RivalTide customers who monitor them for changes, typically once per day per page.</p>
      <h2>Identification</h2>
      <p>Requests use the user agent <code>RivalTideBot/1.0 (+https://rivaltide.com/bot)</code>.</p>
      <h2>Controlling access</h2>
      <p>RivalTideBot obeys robots.txt rules for the <code>RivalTideBot</code> token (or <code>*</code>), including <code>Crawl-delay</code>. To block it entirely:</p>
      <pre className="rounded-lg bg-surface-2 p-4 text-[13px]">User-agent: RivalTideBot{"\n"}Disallow: /</pre>
      <p>RivalTideBot does not log in, does not solve CAPTCHAs, and stops when access is denied.</p>
    </LegalPage>
  );
}
