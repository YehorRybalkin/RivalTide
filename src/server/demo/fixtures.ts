/**
 * FICTIONAL demo fixtures. Every company, price and announcement below is
 * invented for the demo workspace and uses reserved `.example` domains.
 * Each page has versions; the demo seeder runs the real extraction and
 * change-detection engine across consecutive versions.
 */
export interface DemoVersion {
  daysAgo: number;
  html: string;
}
export interface DemoPage {
  path: string;
  type: "homepage" | "pricing" | "features" | "blog";
  versions: DemoVersion[];
  health?: { status: "restricted" | "delayed" | "failed"; detail: string };
}
export interface DemoCompetitor {
  name: string;
  domain: string;
  description: string;
  category: string;
  industry: string;
  pages: DemoPage[];
}

const shell = (company: string, title: string, main: string) => `<!doctype html><html><head><title>${title}</title>
<meta name="description" content="${company} — fictional company used in the RivalTide demo."></head>
<body><nav><a href="/">Home</a><a href="/features">Features</a><a href="/pricing">Pricing</a><a href="/blog">Blog</a></nav>
<main>${main}</main><footer>© 2026 ${company} (fictional)</footer></body></html>`;

const plan = (name: string, price: string, period: string, bullets: string[]) =>
  `<section class="plan"><h3>${name}</h3><p>${price}</p><p>${period}</p><ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul><button>Start free trial</button></section>`;

const posts = (items: [string, string][]) => items.map(([h, p]) => `<article><h2>${h}</h2><p>${p}</p></article>`).join("");

export const DEMO_COMPETITORS: DemoCompetitor[] = [
  {
    name: "Northstar Analytics",
    domain: "northstar-analytics.example",
    description: "Product analytics suite for mid-market SaaS teams.",
    category: "Direct competitor",
    industry: "Product analytics",
    pages: [
      {
        path: "/",
        type: "homepage",
        versions: [
          { daysAgo: 42, html: shell("Northstar Analytics", "Northstar Analytics — Product analytics for growing teams", `<h1>Product analytics for growing teams</h1><p>Understand how customers use your product.</p><h2>Funnels, retention and cohorts</h2><p>Everything you need in one place.</p>`) },
          { daysAgo: 12, html: shell("Northstar Analytics", "Northstar Analytics — The AI analytics platform for product-led companies", `<h1>The AI analytics platform for product-led companies</h1><p>Ask questions in plain English and get answers from your product data.</p><h2>Funnels, retention and cohorts</h2><p>Everything you need in one place.</p>`) },
        ],
      },
      {
        path: "/pricing",
        type: "pricing",
        versions: [
          { daysAgo: 42, html: shell("Northstar Analytics", "Pricing — Northstar Analytics", `<h1>Pricing</h1>${plan("Starter", "€0", "per month", ["Up to 10k events", "1 project"])}${plan("Growth", "€29", "per month", ["1M events", "Unlimited dashboards"])}${plan("Scale", "€99", "per month", ["10M events", "SSO"])}`) },
          { daysAgo: 3, html: shell("Northstar Analytics", "Pricing — Northstar Analytics", `<h1>Pricing</h1>${plan("Starter", "€0", "per month", ["Up to 10k events", "1 project"])}${plan("Growth", "€39", "per month", ["1M events", "Unlimited dashboards", "AI assistant (beta)"])}${plan("Scale", "€99", "per month", ["10M events", "SSO"])}`) },
        ],
      },
      {
        path: "/features",
        type: "features",
        versions: [{ daysAgo: 42, html: shell("Northstar Analytics", "Features — Northstar Analytics", `<h1>Features</h1><h2>Funnels</h2><p>See where users drop off.</p><h2>Retention</h2><p>Measure stickiness by cohort.</p>`) }],
      },
    ],
  },
  {
    name: "BeaconMetrics",
    domain: "beaconmetrics.example",
    description: "Marketing analytics and attribution for agencies and e-commerce brands.",
    category: "Direct competitor",
    industry: "Marketing analytics",
    pages: [
      {
        path: "/features",
        type: "features",
        versions: [
          { daysAgo: 40, html: shell("BeaconMetrics", "Features — BeaconMetrics", `<h1>Features</h1><h2>Multi-touch attribution</h2><p>Credit every channel fairly.</p><h2>Client dashboards</h2><p>Share live dashboards with clients.</p>`) },
          { daysAgo: 5, html: shell("BeaconMetrics", "Features — BeaconMetrics", `<h1>Features</h1><h2>Multi-touch attribution</h2><p>Credit every channel fairly.</p><h2>Client dashboards</h2><p>Share live dashboards with clients.</p><h2>AI anomaly detection</h2><p>Get alerted when spend or conversions move unexpectedly.</p><h2>Looker Studio integration</h2><p>Sync attribution data to Looker Studio.</p>`) },
        ],
      },
      {
        path: "/blog",
        type: "blog",
        versions: [
          { daysAgo: 40, html: shell("BeaconMetrics", "Blog — BeaconMetrics", `<h1>Blog</h1>${posts([["Attribution models explained", "A primer on attribution."], ["Q2 product update", "Small improvements across the board."]])}`) },
          { daysAgo: 5, html: shell("BeaconMetrics", "Blog — BeaconMetrics", `<h1>Blog</h1>${posts([["Introducing Beacon Copilot for agencies", "Our new AI assistant drafts client-ready performance summaries."], ["Attribution models explained", "A primer on attribution."], ["Q2 product update", "Small improvements across the board."]])}`) },
        ],
      },
      {
        path: "/pricing",
        type: "pricing",
        versions: [
          { daysAgo: 40, html: shell("BeaconMetrics", "Pricing — BeaconMetrics", `<h1>Plans</h1>${plan("Essentials", "€59", "per month", ["5 client accounts"])}${plan("Agency", "€149", "per month", ["25 client accounts", "White-label"])}`) },
          { daysAgo: 24, html: shell("BeaconMetrics", "Pricing — BeaconMetrics", `<h1>Plans</h1>${plan("Essentials", "€59", "per month", ["5 client accounts"])}${plan("Agency", "€169", "per month", ["25 client accounts", "White-label", "Copilot included"])}`) },
        ],
      },
    ],
  },
  {
    name: "Flowboard",
    domain: "flowboard.example",
    description: "Collaborative reporting boards for marketing teams.",
    category: "Indirect competitor",
    industry: "Reporting & dashboards",
    pages: [
      {
        path: "/pricing",
        type: "pricing",
        versions: [
          { daysAgo: 38, html: shell("Flowboard", "Pricing — Flowboard", `<h1>Simple pricing</h1>${plan("Team", "€19", "per user / month", ["Unlimited boards"])}${plan("Business", "€35", "per user / month", ["Advanced permissions"])}`) },
          { daysAgo: 9, html: shell("Flowboard", "Pricing — Flowboard", `<h1>Simple pricing</h1>${plan("Team", "€19", "per user / month", ["Unlimited boards"])}${plan("Business", "€35", "per user / month", ["Advanced permissions"])}${plan("Agency", "€199", "per month", ["Unlimited client boards", "Branded exports"])}`) },
        ],
      },
      {
        path: "/",
        type: "homepage",
        versions: [{ daysAgo: 38, html: shell("Flowboard", "Flowboard — Reporting boards your team actually reads", `<h1>Reporting boards your team actually reads</h1><p>Turn data into weekly narratives.</p>`) }],
      },
    ],
  },
  {
    name: "SignalStack",
    domain: "signalstack.example",
    description: "Competitive and market signal monitoring for B2B marketers.",
    category: "Direct competitor",
    industry: "Market intelligence",
    pages: [
      {
        path: "/pricing",
        type: "pricing",
        versions: [
          { daysAgo: 35, html: shell("SignalStack", "Pricing — SignalStack", `<h1>Pricing</h1>${plan("Pro", "$49", "per month", ["10 tracked companies"])}${plan("Team", "$129", "per month", ["40 tracked companies"])}`) },
          { daysAgo: 16, html: shell("SignalStack", "Pricing — SignalStack", `<h1>Pricing</h1>${plan("Pro", "$45", "per month", ["10 tracked companies"])}${plan("Team", "$129", "per month", ["40 tracked companies"])}`) },
        ],
      },
      {
        path: "/",
        type: "homepage",
        versions: [
          { daysAgo: 35, html: shell("SignalStack", "SignalStack — Market signals for B2B marketers", `<h1>Market signals for B2B marketers</h1><p>Track competitors, news and reviews.</p>`) },
          { daysAgo: 2, html: shell("SignalStack", "SignalStack — Competitive intelligence built for agencies", `<h1>Competitive intelligence built for agencies</h1><p>Track competitors for every client from one workspace.</p>`) },
        ],
      },
      {
        path: "/blog",
        type: "blog",
        versions: [{ daysAgo: 35, html: shell("SignalStack", "Blog — SignalStack", `<h1>Blog</h1>${posts([["How to run a win/loss program", "Practical guide."]])}`) }],
        health: { status: "restricted", detail: "Blocked by the website's robots.txt (demo example of a restricted page)" },
      },
    ],
  },
];

/** Hand-written sample analyses (fictional), keyed by competitor + category. Shown as demo samples, not AI output. */
export const DEMO_ANALYSES: Record<string, { interpretation: string; who: string; opportunities: string[]; threats: string[]; actions: string[]; uncertainty: string }> = {
  "Northstar Analytics:pricing": {
    interpretation: "Northstar's Growth plan now costs more and lists an AI assistant. This may signal a move toward premium positioning; it could open room for alternatives positioned on affordability. The reason for the change is not known.",
    who: "Small and mid-sized SaaS teams currently on or evaluating Northstar's Growth tier.",
    opportunities: ["Price-sensitive Growth-tier prospects may be more open to comparing alternatives."],
    threats: ["If the AI assistant resonates, buyers may expect AI features at this price point."],
    actions: ["Review whether your offering targets the same segment before considering any pricing response.", "Check whether your own AI capabilities are clearly communicated on your pricing page."],
    uncertainty: "We do not know whether existing customers are grandfathered or whether the change is a test.",
  },
  "BeaconMetrics:announcement": {
    interpretation: "BeaconMetrics announced an AI assistant aimed at agencies. Combined with new feature headings, this may indicate a push into automated client reporting.",
    who: "Agencies that produce recurring performance summaries for clients.",
    opportunities: ["Differentiate on evidence quality and transparency of automated summaries."],
    threats: ["Agencies may consolidate tools if attribution and reporting are bundled."],
    actions: ["Read the announcement to assess overlap with your roadmap.", "Ask a few agency customers whether automated summaries are a buying criterion."],
    uncertainty: "Availability, pricing and quality of the assistant are not known from the announcement alone.",
  },
  "Flowboard:pricing": {
    interpretation: "Flowboard added a flat-priced Agency plan. This could indicate an expansion from internal teams toward agencies.",
    who: "Agencies evaluating reporting tools priced per client rather than per seat.",
    opportunities: ["Agencies may compare flat pricing models more actively now."],
    threats: ["A flat €199 plan may undercut per-seat pricing for larger agency teams."],
    actions: ["Compare your agency pricing structure with flat-fee alternatives."],
    uncertainty: "Plan limits beyond the listed bullets are unknown.",
  },
  "SignalStack:positioning": {
    interpretation: "SignalStack's homepage now targets agencies directly. This may indicate increased competition in the agency segment.",
    who: "Marketing agencies that monitor competitors on behalf of clients.",
    opportunities: ["Highlight agency-specific workflows you already support."],
    threats: ["Agency prospects may see more direct alternatives."],
    actions: ["Review your own agency messaging and proof points.", "Monitor SignalStack's pricing page for an agency-specific plan."],
    uncertainty: "A messaging change does not confirm product changes.",
  },
};
