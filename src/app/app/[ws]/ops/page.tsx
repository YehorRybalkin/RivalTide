import { notFound } from "next/navigation";
import { loadWorkspace } from "@/server/workspace";
import { getOpsMetrics } from "@/server/services/ops";
import { isAiConfigured, isEmailConfigured, isStripeConfigured, env } from "@/server/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Operations" };
export const dynamic = "force-dynamic";

export default async function OpsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { user } = await loadWorkspace(ws);
  if (!user.isOperator) notFound();
  const m = await getOpsMetrics();
  const totalAttempts = m.outcomes.reduce((n, o) => n + o.n, 0);
  const ok = m.outcomes.filter((o) => ["changed", "unchanged", "baseline", "not_modified"].includes(o.outcome)).reduce((n, o) => n + o.n, 0);
  return (
    <>
      <PageHeader title="Operations" description="Internal reliability and cost visibility (all tenants, excluding demos). Costs are estimates." />
      <div className="mb-6 flex flex-wrap gap-2 text-[12.5px]">
        <Badge tone={isAiConfigured() ? "green" : "slate"}>AI: {isAiConfigured() ? `${env().AI_PROVIDER} (${env().AI_MODEL ?? "default model"})` : "not configured"}</Badge>
        <Badge tone={isEmailConfigured() ? "green" : "slate"}>Email: {isEmailConfigured() ? "Resend" : env().EMAIL_PROVIDER + " stub"}</Badge>
        <Badge tone={isStripeConfigured() ? "green" : "slate"}>Stripe: {isStripeConfigured() ? "configured" : "disabled"}</Badge>
        <Badge tone={env().MONITOR_BROWSER_ENABLED ? "green" : "slate"}>Browser rendering: {env().MONITOR_BROWSER_ENABLED ? "enabled" : "disabled"}</Badge>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Organizations" value={m.totals.orgs} />
        <Stat label="Users" value={m.totals.users} />
        <Stat label="Active pages" value={m.totals.activePages} />
        <Stat label="Queue" value={`${m.totals.queued} / ${m.totals.running}`} hint="queued / running" />
        <Stat label="Failed jobs (24h)" value={m.totals.failedJobs24h} tone={m.totals.failedJobs24h ? "amber" : "green"} />
        <Stat label="Fetch success (7d)" value={totalAttempts ? `${Math.round((ok / totalAttempts) * 100)}%` : "—"} hint={`${totalAttempts} attempts`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Attempt outcomes (7d)</CardTitle></CardHeader><CardContent><ul className="space-y-1 text-[13px]">{m.outcomes.map((o) => <li key={o.outcome} className="flex justify-between"><span className="text-muted">{o.outcome}</span><span className="tabular">{o.n}</span></li>)}</ul></CardContent></Card>
        <Card><CardHeader><CardTitle>Usage & estimated cost (30d)</CardTitle></CardHeader><CardContent><ul className="space-y-1 text-[13px]">{m.usage.map((u) => <li key={u.kind} className="flex justify-between"><span className="text-muted">{u.kind}</span><span className="tabular">{Math.round(u.quantity).toLocaleString()}{u.cost ? ` · $${u.cost.toFixed(4)}` : ""}</span></li>)}</ul><p className="mt-3 text-[11.5px] text-muted">AI cost uses the per-model price table in src/server/ai/provider.ts; verify against your provider invoice.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Health & storage</CardTitle></CardHeader><CardContent className="space-y-3 text-[13px]">
          <ul className="space-y-1">{m.health.map((h) => <li key={h.health} className="flex justify-between"><span className="text-muted">{h.health}</span><span className="tabular">{h.n}</span></li>)}</ul>
          <p className="text-muted">{m.storage.snapshots.toLocaleString()} snapshots · {(m.storage.bytes / 1_048_576).toFixed(1)} MB</p>
          <p className="text-muted">Emails (30d): {m.emails.map((e) => `${e.status} ${e.n}`).join(", ") || "none"}</p>
          {m.totals.stuck ? <p className="text-danger">{m.totals.stuck} job(s) with expired leases</p> : null}
        </CardContent></Card>
      </div>
      <Card className="mt-6 overflow-hidden">
        <CardHeader><CardTitle>Recent monitoring failures</CardTitle></CardHeader>
        <Table className="mt-3">
          <THead><tr><TH>URL</TH><TH>Outcome</TH><TH>Detail</TH><TH>When</TH></tr></THead>
          <tbody>{m.recentFailures.map((f, i) => <TR key={i}><TD className="max-w-[260px] truncate">{f.url}</TD><TD><Badge tone="amber">{f.outcome}</Badge></TD><TD className="max-w-[360px] truncate text-muted">{f.error}</TD><TD className="whitespace-nowrap text-muted">{timeAgo(f.at)}</TD></TR>)}</tbody>
        </Table>
      </Card>
    </>
  );
}
