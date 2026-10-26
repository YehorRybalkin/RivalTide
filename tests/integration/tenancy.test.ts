import { describe, expect, it } from "vitest";
import { systemDb, withUser } from "@/server/db";
import { resolveWorkspace } from "@/server/services/context";
import { createCompetitor, listCompetitors } from "@/server/services/competitors";
import { globalSearch } from "@/server/services/search";
import { makeTenant } from "./helpers";

describe("tenant isolation (RLS)", () => {
  it("prevents a user from reading another organization's rows even without WHERE clauses", async () => {
    const a = await makeTenant("a");
    const b = await makeTenant("b");
    const ctxA = await a.ctx();
    await withUser(a.userId, (tx) => createCompetitor(tx, ctxA, { name: "Secret Rival A", websiteUrl: "https://example.com" }));

    const seenByB = await withUser(b.userId, (tx) => tx<{ name: string }[]>`select name from competitors`);
    expect(seenByB.map((r) => r.name)).not.toContain("Secret Rival A");
    const orgsSeenByB = await withUser(b.userId, (tx) => tx<{ id: string }[]>`select id from organizations`);
    expect(orgsSeenByB.map((r) => r.id)).toEqual([b.orgId]);
    const subsSeenByB = await withUser(b.userId, (tx) => tx`select * from subscriptions`);
    expect(subsSeenByB).toHaveLength(1);
  });

  it("rejects resolving another tenant's workspace", async () => {
    const a = await makeTenant("a2");
    const b = await makeTenant("b2");
    await expect(withUser(b.userId, (tx) => resolveWorkspace(tx, b.userId, a.workspaceId))).rejects.toThrow(/not found/i);
  });

  it("rejects cross-tenant writes", async () => {
    const a = await makeTenant("a3");
    const b = await makeTenant("b3");
    await expect(
      withUser(b.userId, (tx) => tx`insert into competitors (organization_id, workspace_id, name, website_url) values (${a.orgId}, ${a.workspaceId}, 'x', 'https://x.com')`),
    ).rejects.toThrow(/row-level security/i);
    const updated = await withUser(b.userId, (tx) => tx`update client_workspaces set name = 'hacked' where id = ${a.workspaceId} returning id`);
    expect(updated).toHaveLength(0);
  });

  it("blocks access to sessions and system tables", async () => {
    const a = await makeTenant("a4");
    await expect(withUser(a.userId, (tx) => tx`select * from sessions`)).rejects.toThrow(/permission denied/i);
    await expect(withUser(a.userId, (tx) => tx`select * from rate_limits`)).rejects.toThrow(/permission denied/i);
    await expect(withUser(a.userId, (tx) => tx`select password_hash from users`)).rejects.toThrow(/permission denied/i);
  });

  it("members cannot change membership roles; owners can", async () => {
    const a = await makeTenant("a5");
    const other = await makeTenant("x5");
    await systemDb()`insert into memberships (organization_id, user_id, role) values (${a.orgId}, ${other.userId}, 'member')`;
    const r = await withUser(other.userId, (tx) => tx`update memberships set role = 'owner' where organization_id = ${a.orgId} and user_id = ${other.userId} returning id`);
    expect(r).toHaveLength(0);
    const r2 = await withUser(a.userId, (tx) => tx`update memberships set role = 'owner' where organization_id = ${a.orgId} and user_id = ${other.userId} returning id`);
    expect(r2).toHaveLength(1);
  });

  it("scopes global search to the user's organizations", async () => {
    const a = await makeTenant("a6");
    const b = await makeTenant("b6");
    const ctxA = await a.ctx();
    await withUser(a.userId, (tx) => createCompetitor(tx, ctxA, { name: "Zyxwv Unique Corp", websiteUrl: "https://zyxwv.example.com" }));
    const resultsB = await withUser(b.userId, (tx) => globalSearch(tx, "Zyxwv"));
    expect(resultsB).toHaveLength(0);
    const resultsA = await withUser(a.userId, (tx) => globalSearch(tx, "Zyxwv"));
    expect(resultsA.some((r) => r.title === "Zyxwv Unique Corp")).toBe(true);
    const listA = await withUser(a.userId, (tx) => listCompetitors(tx, ctxA));
    expect(listA).toHaveLength(1);
  });
});
