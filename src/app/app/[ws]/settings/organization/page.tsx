import { loadWorkspace } from "@/server/workspace";
import { withUser } from "@/server/db";
import { listInvitations, listMembers } from "@/server/services/organization";
import { getEntitlements, getUsage } from "@/server/billing/entitlements";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Notice } from "@/components/ui/misc";
import { ActionForm } from "@/components/app/action-form";
import { UsageMeter } from "@/components/app/usage-meter";
import { InviteForm } from "@/components/app/invite-form";
import { removeMemberAction, renameOrgAction, revokeInviteAction } from "../actions";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Organization" };

export default async function OrgSettings({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { user, ctx } = await loadWorkspace(ws);
  const { members, invites, ent, usage } = await withUser(user.id, async (tx) => ({
    members: await listMembers(tx, ctx.orgId), invites: await listInvitations(tx, ctx), ent: await getEntitlements(tx, ctx.orgId), usage: await getUsage(tx, ctx.orgId),
  }));
  const owner = ctx.role === "owner";
  return (
    <>
      <Card>
        <CardHeader><div><CardTitle>Organization</CardTitle><CardDescription>Your role: <span className="capitalize">{ctx.role}</span></CardDescription></div></CardHeader>
        <CardContent>
          {owner && !ctx.isDemo ? (
            <ActionForm action={renameOrgAction} hidden={{ ws }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Organization name" htmlFor="org-name" className="flex-1"><Input id="org-name" name="name" defaultValue={ctx.orgName} required /></Field>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          ) : <p className="text-[14px] font-medium">{ctx.orgName}</p>}
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UsageMeter label="Competitors" used={usage.competitors} limit={ent.limits.competitors} />
        <UsageMeter label="Pages" used={usage.pages} limit={ent.limits.pages} />
        <UsageMeter label="Workspaces" used={usage.workspaces} limit={ent.limits.workspaces} />
        <UsageMeter label="Seats" used={usage.seats} limit={ent.limits.seats} />
      </div>
      <Card>
        <CardHeader><div><CardTitle>Members</CardTitle><CardDescription>Owners manage billing and membership. Members can use all workspaces.</CardDescription></div></CardHeader>
        <CardContent className="pt-3">
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-3 text-[13.5px]">
                <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold">{(m.name || m.email).slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{m.name}{m.userId === user.id ? " (you)" : ""}</p><p className="truncate text-[12px] text-muted">{m.email}</p></div>
                <Badge tone={m.role === "owner" ? "blue" : "slate"} className="capitalize">{m.role}</Badge>
                {owner && m.userId !== user.id ? (
                  <ActionForm action={removeMemberAction} hidden={{ ws, userId: m.userId }} confirm={`Remove ${m.email} from ${ctx.orgName}?`}>
                    <SubmitButton variant="ghost" size="sm">Remove</SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
          {owner && invites.length ? (
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-[12px] font-medium text-muted">Pending invitations</p>
              <ul className="space-y-2 text-[13px]">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between">
                    <span>{i.email} <span className="text-muted">· {i.role} · expires {formatDate(i.expiresAt)}</span></span>
                    <form action={revokeInviteAction}><input type="hidden" name="ws" value={ws} /><input type="hidden" name="invitationId" value={i.id} /><button className="text-[12.5px] text-danger hover:underline">Revoke</button></form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {owner && !ctx.isDemo ? (
        <Card>
          <CardHeader><div><CardTitle>Invite a teammate</CardTitle><CardDescription>{ent.limits.seats - usage.seats} seat(s) available on {ent.planName}.</CardDescription></div></CardHeader>
          <CardContent><InviteForm ws={ws} /></CardContent>
        </Card>
      ) : !owner ? <Notice tone="info">Only organization owners can invite or remove members.</Notice> : null}
    </>
  );
}
