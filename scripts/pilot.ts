/**
 * Founder tool: grant a time-limited pilot to an organization WITHOUT marking it as paid.
 *   npm run pilot:grant -- --org <organization-id> --plan growth --days 30 [--note "Agency X pilot"]
 *   npm run pilot:grant -- --email owner@agency.com --plan agency --days 60
 */
import { parseArgs } from "node:util";
import { loadEnvFile } from "./load-env";

loadEnvFile();
const { systemDb, closeDb } = await import("../src/server/db");
const { isPlanId } = await import("../src/server/billing/plans");

const { values } = parseArgs({ options: { org: { type: "string" }, email: { type: "string" }, plan: { type: "string", default: "growth" }, days: { type: "string", default: "30" }, note: { type: "string" } } });
const plan = values.plan!;
const days = Number(values.days);
if (!isPlanId(plan) || plan === "demo") throw new Error("plan must be starter, growth or agency");
if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("days must be 1-365");
const db = systemDb();
let orgId = values.org;
if (!orgId && values.email) {
  const [row] = await db<{ organizationId: string }[]>`select m.organization_id from memberships m join users u on u.id = m.user_id where u.email = ${values.email} and m.role = 'owner' order by m.created_at limit 1`;
  orgId = row?.organizationId;
}
if (!orgId) throw new Error("Organization not found (use --org or --email of an owner)");
await db`insert into subscriptions (organization_id, plan_id, status, is_paid, pilot_ends_at, pilot_note)
  values (${orgId}, ${plan}, 'pilot', false, now() + make_interval(days => ${days}), ${values.note ?? null})
  on conflict (organization_id) do update set plan_id = excluded.plan_id, status = 'pilot', is_paid = false,
    pilot_ends_at = excluded.pilot_ends_at, pilot_note = excluded.pilot_note
  where subscriptions.stripe_subscription_id is null or subscriptions.status not in ('active', 'past_due')`;
await db`insert into audit_logs (organization_id, action, metadata) values (${orgId}, 'billing.pilot_granted', ${db.json({ plan, days, note: values.note ?? null })})`;
const [s] = await db`select plan_id, status, pilot_ends_at, is_paid from subscriptions where organization_id = ${orgId}`;
console.log("Pilot subscription:", s);
await closeDb();
