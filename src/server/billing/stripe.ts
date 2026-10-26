import Stripe from "stripe";
import { systemDb, type Tx } from "../db";
import { audit } from "../audit";
import { env, isStripeConfigured } from "../env";
import type { PlanId } from "./plans";
import { AppError } from "../services/errors";
import { requireOwner, type WorkspaceCtx } from "../services/context";

/**
 * Stripe integration boundary. Checkout stays disabled unless every Stripe
 * variable is configured; nothing here ever simulates a payment.
 */
let client: Stripe | null = null;
function stripe(): Stripe {
  if (!isStripeConfigured()) throw new AppError("Billing is not configured on this server yet.", "invalid");
  client ??= new Stripe(env().STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

function priceFor(plan: PlanId): string {
  const e = env();
  const map: Partial<Record<PlanId, string | undefined>> = { starter: e.STRIPE_PRICE_STARTER, growth: e.STRIPE_PRICE_GROWTH, agency: e.STRIPE_PRICE_AGENCY };
  const price = map[plan];
  if (!price) throw new AppError("This plan is not available for purchase.", "invalid");
  return price;
}

function planForPrice(priceId: string | undefined): PlanId | null {
  const e = env();
  if (priceId === e.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === e.STRIPE_PRICE_GROWTH) return "growth";
  if (priceId === e.STRIPE_PRICE_AGENCY) return "agency";
  return null;
}

export async function createCheckoutSession(tx: Tx, ctx: WorkspaceCtx, plan: PlanId, userEmail: string): Promise<string> {
  requireOwner(ctx);
  if (ctx.isDemo) throw new AppError("The demo cannot be upgraded.", "forbidden");
  const s = stripe();
  const [sub] = await tx<{ stripeCustomerId: string | null }[]>`select stripe_customer_id from subscriptions where organization_id = ${ctx.orgId}`;
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceFor(plan), quantity: 1 }],
    client_reference_id: ctx.orgId,
    customer: sub?.stripeCustomerId ?? undefined,
    customer_email: sub?.stripeCustomerId ? undefined : userEmail,
    subscription_data: { metadata: { organization_id: ctx.orgId } },
    metadata: { organization_id: ctx.orgId },
    allow_promotion_codes: true,
    success_url: `${env().APP_URL}/app/${ctx.workspaceId}/settings/billing?checkout=success`,
    cancel_url: `${env().APP_URL}/app/${ctx.workspaceId}/settings/billing?checkout=cancelled`,
  });
  await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "billing.checkout_started", metadata: { plan } });
  if (!session.url) throw new AppError("Could not start checkout.", "invalid");
  return session.url;
}

export async function createPortalSession(tx: Tx, ctx: WorkspaceCtx): Promise<string> {
  requireOwner(ctx);
  const [sub] = await tx<{ stripeCustomerId: string | null }[]>`select stripe_customer_id from subscriptions where organization_id = ${ctx.orgId}`;
  if (!sub?.stripeCustomerId) throw new AppError("No billing account exists yet.", "invalid");
  const portal = await stripe().billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: `${env().APP_URL}/app/${ctx.workspaceId}/settings/billing` });
  return portal.url;
}

function mapStatus(s: Stripe.Subscription.Status): "active" | "past_due" | "canceled" | null {
  switch (s) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return null; // incomplete / paused: leave current state untouched
  }
}

/** Re-reads the subscription from Stripe (never trusts possibly stale event payloads) and stores it. */
export async function syncSubscription(subscriptionId: string, orgHint?: string | null): Promise<void> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const orgId = (sub.metadata?.organization_id as string | undefined) ?? orgHint ?? null;
  if (!orgId) {
    console.warn(`[stripe] subscription ${subscriptionId} has no organization_id metadata`);
    return;
  }
  const item = sub.items.data[0];
  const plan = planForPrice(item?.price.id);
  const status = mapStatus(sub.status);
  if (!plan || !status) return;
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const db = systemDb();
  await db`insert into subscriptions (organization_id, plan_id, status, is_paid, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end)
    values (${orgId}, ${plan}, ${status}, ${status === "active"}, ${customerId}, ${sub.id}, ${periodEnd ? new Date(periodEnd * 1000) : null}, ${sub.cancel_at_period_end})
    on conflict (organization_id) do update set plan_id = excluded.plan_id, status = excluded.status, is_paid = excluded.is_paid,
      stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id,
      current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
      trial_ends_at = null, pilot_ends_at = null`;
  await audit(db, { orgId, actorId: null, action: "billing.subscription_synced", metadata: { plan, status, stripeStatus: sub.status } });
}

/** Verifies the signature and processes each event at most once. */
export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  if (!isStripeConfigured()) return { ok: false, error: "Stripe is not configured" };
  if (!signature) return { ok: false, error: "Missing signature" };
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, env().STRIPE_WEBHOOK_SECRET!);
  } catch {
    return { ok: false, error: "Invalid signature" };
  }
  const db = systemDb();
  const inserted = await db`insert into stripe_events (id, type) values (${event.id}, ${event.type}) on conflict do nothing returning id`;
  if (inserted.length === 0) return { ok: true, duplicate: true };
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.mode === "subscription" && typeof s.subscription === "string") await syncSubscription(s.subscription, s.client_reference_id);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object.id);
        break;
      case "invoice.payment_failed": {
        const inv = event.data.object as unknown as { subscription?: string | null; parent?: { subscription_details?: { subscription?: string } } };
        const subId = inv.subscription ?? inv.parent?.subscription_details?.subscription;
        if (subId) await syncSubscription(subId);
        break;
      }
      default:
        break;
    }
    return { ok: true };
  } catch (e) {
    // Allow Stripe to retry: forget the event id so the retry is processed.
    await db`delete from stripe_events where id = ${event.id}`;
    return { ok: false, error: (e as Error).message };
  }
}
