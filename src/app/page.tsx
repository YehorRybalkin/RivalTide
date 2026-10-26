import Link from "next/link";
import {
  Activity, ArrowRight, BarChart3, Bell, Building2, CalendarClock, Check, FileText, Layers, LineChart, Lock, Radar,
  ScanSearch, ShieldCheck, Sparkles, Tags,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { PLANS } from "@/server/billing/plans";
import { startDemoAction } from "./(auth)/actions";
import { DemoButton } from "@/components/landing/demo-button";

export const metadata = { title: { absolute: "RivalTide — Know what your competitors do before it changes your business" } };

const features = [
  { icon: CalendarClock, title: "Automated monitoring", body: "Scheduled checks of the competitor pages you choose — homepage, pricing, features, changelog, blog. Daily by default." },
  { icon: Tags, title: "Pricing intelligence", body: "Prices are parsed with plan names, billing period and currency. Monthly and annual prices are never mixed up, and currencies are never silently converted." },
  { icon: Layers, title: "Product & feature tracking", body: "New feature headings, removed sections and product announcements are detected deterministically and filed by category." },
  { icon: Sparkles, title: "AI strategic analysis", body: "Optional AI interpretation of verified changes — clearly separated from observed facts, with stated uncertainty." },
  { icon: BarChart3, title: "Competitive benchmarking", body: "Compare 2–5 competitors side by side. Missing data shows as “Not available”, and competitor claims are labeled as claims." },
  { icon: Activity, title: "Activity feed", body: "A chronological stream of verified changes from each scheduled check, with confidence levels and links to evidence." },
  { icon: Bell, title: "Email alerts & digests", body: "Choose all changes, high-priority only, pricing only, or a weekly digest. Repeat alerts for the same content are suppressed." },
  { icon: FileText, title: "Executive reports", body: "Weekly briefs, competitor deep dives and client reports with a source appendix. Issued reports never change afterwards." },
];

const faqs = [
  { q: "How often are pages checked?", a: "Monitoring runs on a schedule — daily by default on every plan. RivalTide does not claim real-time detection; each change shows exactly when it was detected and when the page was last checked successfully." },
  { q: "What can RivalTide monitor?", a: "Publicly accessible pages that allow automated access. RivalTide respects robots.txt, identifies itself as RivalTideBot, and never bypasses logins, paywalls, CAPTCHAs or bot protection. Pages that block automated access are shown as “Access restricted”." },
  { q: "How do you avoid false alerts?", a: "Every change comes from a deterministic comparison of two successful snapshots. Timestamps, session tokens, cookie banners and other volatile content are masked before comparison. Fetch failures are recorded as monitoring health events, never as competitor changes." },
  { q: "Is the AI analysis reliable?", a: "AI is only used after a change has been verified, and only to interpret it. Observed facts come from the stored evidence, not from the model. Interpretations are labeled, hedged and include what remains uncertain. RivalTide works fully without AI enabled." },
  { q: "Can agencies keep clients separate?", a: "Yes. Each client gets its own workspace with its own competitors, alerts, insights and reports. Data never mixes between workspaces, and organizations are isolated at the database level." },
  { q: "Are these prices final?", a: "The plans shown are launch pricing and may change. Checkout is only enabled once billing is fully configured; we never charge without a verified payment setup." },
];

export default function LandingPage() {
  return (
    <div className="bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="RivalTide home"><Logo /></Link>
          <nav className="hidden items-center gap-6 text-[13.5px] text-muted md:flex" aria-label="Main">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#agencies" className="hover:text-foreground">Agencies</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
            <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
            <Button asChild size="sm"><Link href="/signup">Start Monitoring</Link></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-60 [background-image:radial-gradient(var(--border-strong)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-16 text-center sm:px-6 sm:pt-24">
          <Badge tone="green" className="mb-5 px-2.5 py-1 text-xs"><Radar className="size-3.5" /> Competitive intelligence for agencies & SaaS teams</Badge>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[56px] lg:leading-[1.05]">
            Know What Your Competitors Do Before It Changes Your Business.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted text-pretty sm:text-lg">
            RivalTide tracks competitor websites, pricing, products, and positioning — then turns meaningful changes into actionable competitive intelligence.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg"><Link href="/signup">Start Monitoring <ArrowRight /></Link></Button>
            <form action={startDemoAction}><DemoButton /></form>
          </div>
          <p className="mt-3 text-xs text-muted">Free trial · No card required · The demo uses fictional companies</p>
        </div>
        <ProductPreview />
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="How it works" title="From competitor website to decision in three steps" />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { n: "1", icon: Building2, title: "Add your competitors.", body: "Enter a website. RivalTide checks it is publicly accessible, reads its metadata and suggests the pages worth watching — pricing, features, changelog." },
            { n: "2", icon: ScanSearch, title: "RivalTide detects meaningful changes.", body: "Scheduled checks compare normalized snapshots, filter noise, and classify each verified change by category, severity and confidence." },
            { n: "3", icon: LineChart, title: "Get actionable intelligence.", body: "Review before/after evidence, read the interpretation, get alerts that match your preferences, and share reports with your team or clients." },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border border-border bg-surface p-6 shadow-card">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-sm font-semibold text-primary-soft-foreground">{s.n}</span>
                <s.icon className="size-4 text-muted" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="Features" title="Everything you need to follow the market — nothing you can't verify" />
          <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title}>
                <f.icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-3 text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Evidence showcase */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading align="left" eyebrow="Evidence first" title="Every claim links back to what actually changed" />
            <ul className="mt-6 space-y-3 text-[14px] text-muted">
              {["Before/after excerpts from two successful snapshots", "Detection time, source URL and confidence on every change", "Observed facts kept separate from AI interpretation", "Low-confidence detections flagged for your review"].map((t) => (
                <li key={t} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <EvidencePreview />
        </div>
      </section>

      {/* Agencies */}
      <section id="agencies" className="scroll-mt-20 bg-sidebar text-sidebar-foreground">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-primary">For marketing agencies</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">One account. Every client&apos;s competitive landscape.</h2>
            <p className="mt-4 text-[15px] leading-relaxed">
              Create a workspace per client, track their competitors separately, and deliver branded competitor reports on a regular cadence — without spreadsheets or manual screenshots.
            </p>
            <ul className="mt-8 grid gap-3 text-[14px] sm:grid-cols-2">
              {["Separate client workspaces", "Agency overview across clients", "White-label PDF reports", "Team collaboration", "Per-workspace alert subscriptions", "Report history with stored versions"].map((t) => (
                <li key={t} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-sidebar-border bg-sidebar-active p-5" aria-label="Agency overview preview (demo data)">
            <div className="mb-4 flex items-center justify-between text-xs"><span className="font-medium text-white">Agency overview</span><Badge tone="amber">Demo data</Badge></div>
            {[["Acme Insights", 4, 7, 2], ["Lumen Retail", 3, 2, 0], ["Northwind Travel", 5, 4, 1]].map(([n, c, ch, hi]) => (
              <div key={n as string} className="flex items-center justify-between border-t border-sidebar-border py-3 text-[13px]">
                <span className="text-white">{n}</span>
                <span className="flex gap-4 text-sidebar-muted"><span>{c} competitors</span><span>{ch} changes</span><span className={hi ? "text-warning" : ""}>{hi} high</span></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Pricing" title="Plans that scale with the pages you monitor" description="Launch pricing in EUR, billed monthly. Every plan starts with a free trial." />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {(["starter", "growth", "agency"] as const).map((id) => {
            const p = PLANS[id];
            const featured = id === "growth";
            return (
              <div key={id} className={`relative flex flex-col rounded-2xl border bg-surface p-6 shadow-card ${featured ? "border-primary ring-1 ring-primary" : "border-border"}`}>
                {featured ? <Badge tone="green" className="absolute -top-2.5 left-6">Most popular</Badge> : null}
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-1 text-[13px] text-muted">{p.tagline}</p>
                <p className="mt-5"><span className="text-4xl font-semibold tracking-tight">€{p.priceEur}</span><span className="text-sm text-muted">/month</span></p>
                <ul className="mt-6 flex-1 space-y-2.5 text-[13.5px]">
                  {p.highlights.map((h) => <li key={h} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{h}</li>)}
                </ul>
                <Button asChild variant={featured ? "primary" : "secondary"} className="mt-8 w-full"><Link href="/signup">Start free trial</Link></Button>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-xs text-muted">Prices exclude VAT where applicable. Plan limits are enforced per organization.</p>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="FAQ" title="Questions, answered honestly" />
          <div className="mt-10 divide-y divide-border rounded-xl border border-border">
            {faqs.map((f) => (
              <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-medium">
                  {f.q}<span className="text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-[14px] leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Lock, title: "Isolated by design", body: "Every organization's data is isolated with database row-level security, in addition to server-side authorization checks." },
            { icon: ShieldCheck, title: "Responsible monitoring", body: "robots.txt is respected, requests are rate-limited per domain, and protected or private content is never accessed." },
            { icon: Sparkles, title: "Careful with AI", body: "Website content is treated as untrusted input. AI never runs in your browser and never adds facts to the evidence." },
          ].map((s) => (
            <div key={s.title} className="rounded-xl border border-border p-6">
              <s.icon className="size-5 text-accent" aria-hidden />
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-[13px] text-muted"><Link href="/security" className="text-accent hover:underline">Read our security & privacy overview</Link></p>
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-2xl bg-sidebar px-6 py-14 text-center sm:px-12">
          <h2 className="text-3xl font-semibold tracking-tight text-white">Stay ahead of the competition.</h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] text-sidebar-foreground">Set up your first competitor in a few minutes. Your first comparison is available after the second scheduled check.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg"><Link href="/signup">Start Monitoring</Link></Button>
            <form action={startDemoAction}><DemoButton dark /></form>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 text-[13px] text-muted sm:flex-row sm:items-center sm:px-6">
          <div><Logo /><p className="mt-2">Track competitors. Understand every move. Make smarter decisions.</p></div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            <Link href="/legal/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link href="/legal/terms" className="hover:text-foreground">Terms of Service</Link>
            <Link href="/security" className="hover:text-foreground">Security</Link>
            <Link href="/bot" className="hover:text-foreground">RivalTideBot</Link>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description, align = "center" }: { eyebrow: string; title: string; description?: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : ""}>
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{title}</h2>
      {description ? <p className="mt-3 text-[15px] text-muted">{description}</p> : null}
    </div>
  );
}

function ProductPreview() {
  const rows = [
    { c: "Northstar Analytics", cat: "Pricing", tone: "green" as const, sev: "High", s: "Growth plan monthly price increased from €29 to €39", t: "3 days ago", conf: "95%" },
    { c: "SignalStack", cat: "Positioning", tone: "amber" as const, sev: "Medium", s: "Headline changed to “Competitive intelligence built for agencies”", t: "2 days ago", conf: "70%" },
    { c: "BeaconMetrics", cat: "Announcement", tone: "pink" as const, sev: "Medium", s: "New entry published: “Introducing Beacon Copilot for agencies”", t: "5 days ago", conf: "85%" },
    { c: "Flowboard", cat: "Pricing", tone: "green" as const, sev: "Medium", s: "New pricing entry: Agency plan monthly at €199", t: "9 days ago", conf: "80%" },
  ];
  return (
    <div className="relative mx-auto max-w-6xl px-4 pb-8 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-pop" role="img" aria-label="Preview of the RivalTide dashboard with fictional demo data">
        <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden><span className="size-2.5 rounded-full bg-border-strong" /><span className="size-2.5 rounded-full bg-border-strong" /><span className="size-2.5 rounded-full bg-border-strong" /></div>
          <Badge tone="amber">Demo data · fictional companies</Badge>
        </div>
        <div className="grid md:grid-cols-[200px_1fr]">
          <div className="hidden bg-sidebar p-4 md:block">
            <Logo light className="mb-6" />
            {["Overview", "Competitors", "Changes", "Insights", "Compare", "Reports"].map((n, i) => (
              <div key={n} className={`mb-1 rounded-md px-2.5 py-1.5 text-[12.5px] ${i === 0 ? "bg-sidebar-active text-white" : "text-sidebar-muted"}`}>{n}</div>
            ))}
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[["Competitors", "4"], ["Active pages", "11"], ["Important this week", "4"], ["Pricing changes (30d)", "4"]].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-border p-3 text-left"><div className="text-[11.5px] text-muted">{l}</div><div className="tabular mt-1 text-xl font-semibold">{v}</div></div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-border text-left">
              <div className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold">Competitive activity</div>
              {rows.map((r) => (
                <div key={r.s} className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex items-center gap-2"><Badge tone={r.tone}>{r.cat}</Badge><span className="text-[12.5px] font-medium">{r.c}</span></div>
                  <span className="flex-1 truncate text-[12.5px] text-muted">{r.s}</span>
                  <span className="text-[11.5px] text-subtle">{r.sev} · {r.conf} · {r.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidencePreview() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-pop" role="img" aria-label="Preview of change evidence with fictional demo data">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Badge tone="green">Pricing</Badge><Badge tone="red">High</Badge></div>
        <Badge tone="amber">Demo data</Badge>
      </div>
      <p className="mt-3 text-[14px] font-medium">Growth plan monthly price increased from €29 to €39</p>
      <p className="mt-1 text-xs text-muted">northstar-analytics.example/pricing · Confidence 95% · Detected 3 days ago</p>
      <div className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2">
        <div className="rounded-lg border border-diff-del-border bg-diff-del p-3"><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Before</div>€29 · per month</div>
        <div className="rounded-lg border border-diff-add-border bg-diff-add p-3"><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">After</div>€39 · per month</div>
      </div>
      <div className="mt-4 rounded-lg bg-surface-2 p-3 text-[13px]">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted"><Sparkles className="size-3" /> Interpretation</div>
        <p className="text-muted">This price increase may create an opportunity for alternatives positioned on affordability. The underlying reason for the change is unknown.</p>
      </div>
    </div>
  );
}
