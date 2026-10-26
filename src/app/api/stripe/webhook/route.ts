import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/server/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const result = await handleStripeWebhook(body, req.headers.get("stripe-signature"));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "Stripe is not configured" ? 404 : 400 });
  return NextResponse.json({ received: true, duplicate: result.duplicate ?? false });
}
