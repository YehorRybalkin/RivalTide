import { Check } from "lucide-react";
import { loadWorkspace } from "@/server/workspace";
import { withUser } from "@/server/db";
import { getEntitlements, getUsage } from "@/server/billing/entitlements";
import { PLANS } from "@/server/billing/plans";
import { isStripeConfigured } from "@/server/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/app/action-form";
import { UsageMeter } from "@/components/app/usage-meter";
import { checkoutAction, portalAction } from "../actions";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Plan & billing" };

export default async function BillingSettings({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { ws } = await params;
  const { checkout } = await searchParams;
  const { user, ctx } = await loadWorkspace(ws);
  const { ent, usage, sub } = await withUser(user.id, async (tx) => {
    const [sub] = await tx<{ stripeCustomerId: string | null; cancelAtPeriodEnd: boolean; pilotNote: string | null }[]>`select stripe_customer_id, cancel_at_period_end, pilot_note from subscriptions where organization_id = ${ctx.orgId}`;
    return { ent: await getEntitlements(tx, ctx.orgId), usage: await getUsage(tx, ctx.orgId), sub };
  });
  const stripe = isStripeConfigured();
  const owner = ctx.role === "owner";
  return (
    <>
      {checkout === "success" ? <Notice tone="success" title="Thanks!">Your subscription will appear here as soon as Stripe confirms the payment (usually within a minute).</Notice> : null}
      {checkout === "cancelled" ? <Notice tone="info">Checkout was cancelled. No payment was taken.</Notice> : null}
      <Card>
        <CardHeader>
          <div><CardTitle>Current plan: {ent.planName}</CardTitle><CardDescription>{ent.statusLabel}{ent.endsAt ? ` · ${ent.status === "active" ? (sub?.cancelAtPeriodEnd ? "ends" : "renews") : "ends"} ${formatDate(ent.endsAt)}` : ""}{sub?.pilotNote ? ` · ${sub.pilotNote}` : ""}</CardDescription></div>
          <Badge tone={ent.isPaid ? "green" : ent.active ? "blue" : "amber"}>{ent.isPaid ? "Paid" : ent.active ? "Not billed" : "Inactive"}</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <UsageMeter label="Competitors" used={usage.competitors} limit={ent.limits.competitors} />
          <UsageMeter label="Monitored pages" used={usage.pages} limit={ent.limits.pages} />
          <UsageMeter label="AI analyses this month" used={usage.aiAnalysesThisMonth} limit={ent.limits.aiAnalysesPerMonth} />
          <UsageMeter label="Reports this month" used={usage.reportsThisMonth} limit={ent.limits.reportsPerMonth} />
        </CardContent>
      </Card>
      {!stripe ? (
        <Notice tone="info" title="Online checkout is not enabled yet">Billing is not configured on this server, so no payments can be taken. Contact the RivalTide team to extend a trial or arrange a pilot.</Notice>
      ) : null}
      {ctx.isDemo ? <Notice tone="info">The demo cannot be upgraded.</Notice> : !owner ? <Notice tone="info">Only organization owners can manage billing.</Notice> : (
        <div className="grid gap-4 md:grid-cols-3">
          {(["starter", "growth", "agency"] as const).map((id) => {
            const p = PLANS[id];
            const current = ent.planId === id && ent.isPaid;
            return (
              <Card key={id} className={current ? "border-primary ring-1 ring-primary" : ""}>
                <CardContent className="flex h-full flex-col">
                  <p className="font-semibold">{p.name}</p>
                  <p className="mt-1"><span className="text-2xl font-semibold">€{p.priceEur}</span><span className="text-[13px] text-muted">/month</span></p>
                  <ul className="mt-4 flex-1 space-y-1.5 text-[12.5px]">{p.highlights.map((h) => <li key={h} className="flex gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0 text-primary" />{h}</li>)}</ul>
                  {current ? <Badge tone="green" className="mt-4 w-fit">Current plan</Badge> : (
                    <ActionForm action={checkoutAction} hidden={{ ws, plan: id }} className="mt-4">
                      <SubmitButton className="w-full" variant={id === "growth" ? "primary" : "secondary"} disabled={!stripe} pendingText="Redirecting…">{stripe ? `Choose ${p.name}` : "Checkout unavailable"}</SubmitButton>
                    </ActionForm>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {owner && stripe && sub?.stripeCustomerId ? (
        <Card><CardContent className="flex items-center justify-between gap-4"><p className="text-[13px] text-muted">Update payment method, download invoices, or cancel in the Stripe customer portal.</p><ActionForm action={portalAction} hidden={{ ws }}><SubmitButton variant="secondary">Manage billing</SubmitButton></ActionForm></CardContent></Card>
      ) : null}
      <p className="text-[12px] text-muted">Prices are launch pricing in EUR and exclude VAT where applicable. Card details are handled by Stripe and never stored by RivalTide.</p>
    </>
  );
}
