import type { ReportChange, ReportContent } from "@/server/services/reports";
import { CATEGORY_META, formatDate } from "@/lib/utils";

function ChangeList({ items, title }: { items: ReportChange[]; title: string }) {
  if (!items.length) return null;
  return (
    <section className="mt-8 break-inside-avoid-page">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ol className="mt-3 space-y-3">
        {items.map((c) => (
          <li key={c.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <span className="font-semibold text-foreground">{c.competitor}</span>
              <span>· {CATEGORY_META[c.category]?.label ?? c.category}</span>
              <span>· {c.severity} severity</span>
              <span>· {Math.round(c.confidence * 100)}% confidence</span>
              <span>· {formatDate(c.detectedAt)}</span>
              {c.needsReview ? <span className="font-medium text-danger">· needs review</span> : null}
            </div>
            <p className="mt-1.5 text-[14px] font-medium">{c.summary}</p>
            {c.evidence.prices.length ? <ul className="mt-2 list-disc pl-5 text-[13px]">{c.evidence.prices.map((p, i) => <li key={i}>{p}</li>)}</ul> : null}
            {c.evidence.before.length || c.evidence.after.length ? (
              <div className="mt-2 grid gap-2 text-[12.5px] md:grid-cols-2">
                <div className="rounded-md bg-diff-del p-2"><span className="font-medium">Before: </span>{c.evidence.before.join(" · ") || "—"}</div>
                <div className="rounded-md bg-diff-add p-2"><span className="font-medium">After: </span>{c.evidence.after.join(" · ") || "—"}</div>
              </div>
            ) : null}
            <p className="mt-2 break-all text-[11.5px] text-muted">Source: {c.sourceUrl}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Renders a frozen report. Content comes only from the stored report JSON. */
export function ReportView({ r }: { r: ReportContent }) {
  return (
    <article className="mx-auto max-w-3xl rounded-xl border border-border bg-surface p-8 shadow-card print:border-0 print:p-0 print:shadow-none sm:p-12">
      {r.isDemo ? <p className="mb-6 rounded-md bg-warning-soft px-3 py-2 text-[12.5px] font-medium text-warning-soft-foreground">SAMPLE REPORT — generated from fictional demo data. Not real competitor intelligence.</p> : null}
      <header className="border-b-2 pb-6" style={{ borderColor: r.branding.color }}>
        <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: r.branding.color }}>{r.branding.name}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{r.title}</h1>
        <p className="mt-2 text-[13px] text-muted">
          {r.workspace.clientName ? <>Prepared for {r.workspace.clientName} · </> : null}
          Period {formatDate(r.period.start)} – {formatDate(r.period.end)} · Generated {formatDate(r.generatedAt, true)}
        </p>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Executive summary</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px]">{r.executiveSummary.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>

      <section className="mt-6 rounded-lg bg-surface-2 p-4 text-[13px]">
        <h2 className="font-semibold">Monitoring coverage</h2>
        <p className="mt-1 text-muted">{r.coverage.competitors} competitor(s) · {r.coverage.activePages} active page(s) · {r.coverage.healthyPages} healthy at generation time</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{r.coverage.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      </section>

      {r.type === "competitor_deep_dive" || r.type === "client_report" ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{r.type === "competitor_deep_dive" ? "Competitor overview" : "Competitor activity"}</h2>
          <div className="mt-3 space-y-3">
            {r.competitorOverview.map((c) => (
              <div key={c.name} className="rounded-lg border border-border p-4 text-[13px]">
                <p className="font-semibold">{c.name} <span className="font-normal text-muted">· {c.website}</span></p>
                {c.description ? <p className="mt-1 text-muted">{c.description}</p> : null}
                <p className="mt-1 text-muted">{c.changes} verified change(s) in period · Monitored footprint: {c.pages.length ? c.pages.join("; ") : "none"}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ChangeList title="Major competitor changes" items={r.majorChanges} />
      <ChangeList title="Pricing developments" items={r.pricing} />
      <ChangeList title="Product developments" items={r.product} />
      <ChangeList title="Positioning observations" items={r.positioning} />
      {r.type !== "weekly_brief" ? <ChangeList title="Other changes" items={r.otherChanges} /> : null}

      {r.insights.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Strategic interpretation</h2>
          <p className="mt-1 text-[12.5px] text-muted">Interpretations are hypotheses, not verified facts. Each lists its supporting observations and what remains uncertain.</p>
          <div className="mt-3 space-y-3">
            {r.insights.map((i) => (
              <div key={i.id} className="rounded-lg border border-border p-4 text-[13px]">
                <p className="font-semibold">{i.title} <span className="font-normal text-muted">· {i.importance} importance · {i.generatedBy === "ai" ? (r.isDemo ? "sample analysis" : "AI-assisted") : "rule-based"}</span></p>
                <p className="mt-2 text-[12px] font-medium uppercase tracking-wide text-muted">Observed</p>
                <ul className="list-disc pl-5">{i.facts.map((f, k) => <li key={k}>{f}</li>)}</ul>
                <p className="mt-2 text-[12px] font-medium uppercase tracking-wide text-muted">Interpretation</p>
                <p>{i.interpretation}</p>
                <p className="mt-2 text-muted"><span className="font-medium">Uncertainty:</span> {i.uncertainty}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {r.nextActions.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Suggested next actions</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px]">{r.nextActions.map((a, i) => <li key={i}>{a}</li>)}</ul>
          <p className="mt-2 text-[12px] text-muted">These are options to evaluate, not recommendations guaranteed to succeed.</p>
        </section>
      ) : null}

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-base font-semibold">Source appendix</h2>
        {r.appendix.length === 0 ? <p className="mt-2 text-[13px] text-muted">No changes in this period.</p> : (
          <table className="mt-3 w-full text-[11.5px]">
            <thead className="text-left text-muted"><tr><th className="py-1 pr-2">Competitor</th><th className="py-1 pr-2">Detected</th><th className="py-1 pr-2">Source</th><th className="py-1">Evidence ID</th></tr></thead>
            <tbody>{r.appendix.map((a) => <tr key={a.id} className="border-t border-border align-top"><td className="py-1 pr-2">{a.competitor}</td><td className="py-1 pr-2 whitespace-nowrap">{formatDate(a.detectedAt)}</td><td className="break-all py-1 pr-2">{a.sourceUrl}</td><td className="py-1 font-mono">{a.id.slice(0, 8)}</td></tr>)}</tbody>
          </table>
        )}
      </section>
      {!r.branding.whiteLabel ? <p className="mt-8 text-center text-[11px] text-muted">Generated with RivalTide</p> : null}
    </article>
  );
}
