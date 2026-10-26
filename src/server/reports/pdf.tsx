import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReportChange, ReportContent } from "../services/reports";

const CAT: Record<string, string> = { pricing: "Pricing", product: "Product", features: "Features", positioning: "Positioning", announcement: "Announcement", general: "General update", unclassified: "Needs review" };
const d = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/** Standard PDF fonts only support Latin-1/WinAnsi; replace characters they cannot render. */
const safe = (s: string) => s.replace(/[←-⇿∀-⋿✀-➿\u{1F000}-\u{1FFFF}]/gu, "?");

function makeStyles(color: string) {
  return StyleSheet.create({
    page: { paddingTop: 56, paddingBottom: 56, paddingHorizontal: 48, fontSize: 9.5, fontFamily: "Helvetica", color: "#111827", lineHeight: 1.45 },
    header: { position: "absolute", top: 22, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#64748B" },
    footer: { position: "absolute", bottom: 22, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#64748B" },
    brand: { fontSize: 8, color, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, textTransform: "uppercase" },
    title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 6 },
    meta: { color: "#64748B", marginTop: 4 },
    rule: { borderBottomWidth: 2, borderBottomColor: color, marginTop: 14, marginBottom: 14 },
    h2: { fontSize: 12.5, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
    bullet: { flexDirection: "row", marginBottom: 3 },
    dot: { width: 10 },
    box: { backgroundColor: "#F1F5F9", padding: 10, borderRadius: 4, marginTop: 8 },
    card: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 4, padding: 9, marginBottom: 7 },
    small: { fontSize: 8, color: "#64748B" },
    bold: { fontFamily: "Helvetica-Bold" },
    before: { backgroundColor: "#FEF2F2", padding: 5, marginTop: 4, fontSize: 8.5 },
    after: { backgroundColor: "#ECFDF5", padding: 5, marginTop: 3, fontSize: 8.5 },
    demo: { backgroundColor: "#FFFBEB", color: "#B45309", padding: 6, marginBottom: 10, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
    row: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: "#E2E8F0", paddingVertical: 3, fontSize: 7.5 },
  });
}

function Bullets({ items, s }: { items: string[]; s: ReturnType<typeof makeStyles> }) {
  return <View>{items.map((t, i) => <View key={i} style={s.bullet}><Text style={s.dot}>•</Text><Text style={{ flex: 1 }}>{safe(t)}</Text></View>)}</View>;
}

function Changes({ title, items, s }: { title: string; items: ReportChange[]; s: ReturnType<typeof makeStyles> }) {
  if (!items.length) return null;
  return (
    <View>
      <Text style={s.h2}>{title}</Text>
      {items.map((c) => (
        <View key={c.id} style={s.card} wrap={false}>
          <Text style={s.small}>{safe(c.competitor)} · {CAT[c.category] ?? c.category} · {c.severity} severity · {Math.round(c.confidence * 100)}% confidence · {d(c.detectedAt)}{c.needsReview ? " · NEEDS REVIEW" : ""}</Text>
          <Text style={[s.bold, { marginTop: 3 }]}>{safe(c.summary)}</Text>
          {c.evidence.prices.length ? <View style={{ marginTop: 3 }}><Bullets items={c.evidence.prices} s={s} /></View> : null}
          {c.evidence.before.length ? <Text style={s.before}>Before: {safe(c.evidence.before.join(" · ").slice(0, 600))}</Text> : null}
          {c.evidence.after.length ? <Text style={s.after}>After: {safe(c.evidence.after.join(" · ").slice(0, 600))}</Text> : null}
          <Text style={[s.small, { marginTop: 4 }]}>Source: {c.sourceUrl}</Text>
        </View>
      ))}
    </View>
  );
}

function ReportPdf({ r }: { r: ReportContent }) {
  const s = makeStyles(r.branding.color);
  return (
    <Document title={r.title} author={r.branding.name} creator={r.branding.whiteLabel ? r.branding.name : "RivalTide"} producer={r.branding.whiteLabel ? r.branding.name : "RivalTide"}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Text>{safe(r.branding.name)}{r.workspace.clientName ? ` · ${safe(r.workspace.clientName)}` : ""}</Text>
          <Text>{d(r.period.start)} – {d(r.period.end)}</Text>
        </View>
        {r.isDemo ? <Text style={s.demo}>SAMPLE REPORT — generated from fictional demo data. Not real competitor intelligence.</Text> : null}
        <Text style={s.brand}>{safe(r.branding.name)}</Text>
        <Text style={s.title}>{safe(r.title)}</Text>
        <Text style={s.meta}>{r.workspace.clientName ? `Prepared for ${safe(r.workspace.clientName)} · ` : ""}Period {d(r.period.start)} – {d(r.period.end)} · Generated {d(r.generatedAt)}</Text>
        <View style={s.rule} />
        <Text style={s.h2}>Executive summary</Text>
        <Bullets items={r.executiveSummary} s={s} />
        <View style={s.box}>
          <Text style={s.bold}>Monitoring coverage</Text>
          <Text style={s.small}>{r.coverage.competitors} competitor(s) · {r.coverage.activePages} active page(s) · {r.coverage.healthyPages} healthy at generation time</Text>
          <View style={{ marginTop: 4 }}><Bullets items={r.coverage.notes} s={s} /></View>
        </View>
        {r.type !== "weekly_brief" ? (
          <View>
            <Text style={s.h2}>{r.type === "competitor_deep_dive" ? "Competitor overview" : "Competitor activity"}</Text>
            {r.competitorOverview.map((c) => (
              <View key={c.name} style={s.card} wrap={false}>
                <Text style={s.bold}>{safe(c.name)} <Text style={s.small}>{c.website}</Text></Text>
                {c.description ? <Text style={s.small}>{safe(c.description)}</Text> : null}
                <Text style={s.small}>{c.changes} verified change(s) · Monitored: {c.pages.length ? c.pages.join("; ") : "none"}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Changes title="Major competitor changes" items={r.majorChanges} s={s} />
        <Changes title="Pricing developments" items={r.pricing} s={s} />
        <Changes title="Product developments" items={r.product} s={s} />
        <Changes title="Positioning observations" items={r.positioning} s={s} />
        {r.type !== "weekly_brief" ? <Changes title="Other changes" items={r.otherChanges} s={s} /> : null}
        {r.insights.length ? (
          <View>
            <Text style={s.h2}>Strategic interpretation</Text>
            <Text style={s.small}>Interpretations are hypotheses, not verified facts.</Text>
            {r.insights.map((i) => (
              <View key={i.id} style={[s.card, { marginTop: 6 }]} wrap={false}>
                <Text style={s.bold}>{safe(i.title)}</Text>
                <Text style={s.small}>{i.importance} importance · {i.generatedBy === "ai" ? (r.isDemo ? "sample analysis" : "AI-assisted") : "rule-based"}</Text>
                <Text style={[s.small, s.bold, { marginTop: 4 }]}>OBSERVED</Text>
                <Bullets items={i.facts} s={s} />
                <Text style={[s.small, s.bold, { marginTop: 2 }]}>INTERPRETATION</Text>
                <Text>{safe(i.interpretation)}</Text>
                <Text style={[s.small, { marginTop: 3 }]}>Uncertainty: {safe(i.uncertainty)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {r.nextActions.length ? (
          <View>
            <Text style={s.h2}>Suggested next actions</Text>
            <Bullets items={r.nextActions} s={s} />
            <Text style={s.small}>These are options to evaluate, not recommendations guaranteed to succeed.</Text>
          </View>
        ) : null}
        <View break={r.appendix.length > 8}>
          <Text style={s.h2}>Source appendix</Text>
          {r.appendix.length === 0 ? <Text style={s.small}>No changes in this period.</Text> : r.appendix.map((a) => (
            <View key={a.id} style={s.row} wrap={false}>
              <Text style={{ width: 90 }}>{safe(a.competitor)}</Text>
              <Text style={{ width: 55 }}>{d(a.detectedAt)}</Text>
              <Text style={{ flex: 1 }}>{a.sourceUrl}</Text>
              <Text style={{ width: 50 }}>{a.id.slice(0, 8)}</Text>
            </View>
          ))}
        </View>
        <View style={s.footer} fixed>
          <Text>{r.branding.whiteLabel ? safe(r.branding.name) : "Generated with RivalTide"}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(content: ReportContent): Promise<Buffer> {
  return renderToBuffer(<ReportPdf r={content} />);
}
