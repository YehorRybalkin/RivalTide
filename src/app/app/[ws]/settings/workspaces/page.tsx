import Link from "next/link";
import { loadWorkspace } from "@/server/workspace";
import { withUser } from "@/server/db";
import { getEntitlements, getUsage } from "@/server/billing/entitlements";
import { listMemberships } from "@/server/services/accounts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/app/action-form";
import { createWorkspaceAction } from "../actions";

export const metadata = { title: "Client workspaces" };

export default async function WorkspacesSettings({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { user, ctx } = await loadWorkspace(ws);
  const [{ workspaces }, { ent, usage }] = await Promise.all([
    listMemberships(user.id),
    withUser(user.id, async (tx) => ({ ent: await getEntitlements(tx, ctx.orgId), usage: await getUsage(tx, ctx.orgId) })),
  ]);
  const mine = workspaces.filter((w) => w.organizationId === ctx.orgId);
  const canCreate = usage.workspaces < ent.limits.workspaces && ent.active && !ctx.isDemo;
  return (
    <>
      <Card>
        <CardHeader><div><CardTitle>Client workspaces</CardTitle><CardDescription>{usage.workspaces} of {ent.limits.workspaces} workspaces used on {ent.planName}.</CardDescription></div></CardHeader>
        <CardContent className="pt-3">
          <ul className="divide-y divide-border text-[13.5px]">
            {mine.map((w) => <li key={w.id} className="flex items-center justify-between py-2.5"><span>{w.name}{w.clientName ? <span className="text-muted"> · {w.clientName}</span> : null}</span><Link href={`/app/${w.id}`} className="text-accent hover:underline">Open</Link></li>)}
          </ul>
        </CardContent>
      </Card>
      {canCreate ? (
        <Card>
          <CardHeader><div><CardTitle>New client workspace</CardTitle><CardDescription>Each workspace has its own competitors, alerts, insights and reports.</CardDescription></div></CardHeader>
          <CardContent>
            <ActionForm action={createWorkspaceAction} hidden={{ ws }} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Workspace name" htmlFor="nw-name"><Input id="nw-name" name="name" required placeholder="Client: Lumen Retail" /></Field>
                <Field label="Client name" htmlFor="nw-client"><Input id="nw-client" name="clientName" placeholder="Lumen Retail" /></Field>
              </div>
              <Field label="Description (optional)" htmlFor="nw-desc"><Input id="nw-desc" name="description" /></Field>
              <SubmitButton>Create workspace</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : <Notice tone="info">{ctx.isDemo ? "The demo is read-only." : `Your plan includes ${ent.limits.workspaces} workspace(s). Upgrade to Agency to manage multiple clients.`}</Notice>}
    </>
  );
}
