import { loadWorkspace } from "@/server/workspace";
import { withUser } from "@/server/db";
import { getEntitlements } from "@/server/billing/entitlements";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/app/action-form";
import { archiveWorkspaceAction, updateWorkspaceAction } from "../actions";

export const metadata = { title: "Workspace settings" };

export default async function WorkspaceSettings({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { user, ctx } = await loadWorkspace(ws);
  const { w, ent } = await withUser(user.id, async (tx) => {
    const [w] = await tx<{ name: string; clientName: string | null; description: string | null; brandName: string | null; brandColor: string | null; interval: number }[]>`
      select name, client_name, description, brand_name, brand_color, default_check_interval_hours as interval from client_workspaces where id = ${ws}`;
    return { w: w!, ent: await getEntitlements(tx, ctx.orgId) };
  });
  const disabled = ctx.isDemo;
  return (
    <>
      <Card>
        <CardHeader><div><CardTitle>Workspace</CardTitle><CardDescription>Competitors, alerts, insights and reports in this workspace are kept separate from your other workspaces.</CardDescription></div></CardHeader>
        <CardContent>
          <ActionForm action={updateWorkspaceAction} hidden={{ ws }} className="space-y-4">
            <fieldset disabled={disabled} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Workspace name" htmlFor="w-name"><Input id="w-name" name="name" defaultValue={w.name} required /></Field>
                <Field label="Client name" htmlFor="w-client" hint="Shown on client reports."><Input id="w-client" name="clientName" defaultValue={w.clientName ?? ""} /></Field>
              </div>
              <Field label="Description" htmlFor="w-desc"><Textarea id="w-desc" name="description" defaultValue={w.description ?? ""} rows={2} /></Field>
              <Field label="Check frequency" htmlFor="w-int" hint={`Scheduled checks run at most every ${ent.limits.minCheckIntervalHours} hours on your plan.`}>
                <Select id="w-int" name="interval" defaultValue={String(w.interval)}>
                  <option value="24">Daily</option><option value="48">Every 2 days</option><option value="168">Weekly</option>
                </Select>
              </Field>
              <div className="rounded-lg border border-border p-4">
                <p className="text-[13px] font-medium">Report branding {ent.limits.whiteLabel ? "" : <span className="font-normal text-muted">(Agency plan)</span>}</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Brand name" htmlFor="w-brand"><Input id="w-brand" name="brandName" defaultValue={w.brandName ?? ""} disabled={!ent.limits.whiteLabel} placeholder="Your agency" /></Field>
                  <Field label="Brand colour" htmlFor="w-color"><Input id="w-color" name="brandColor" defaultValue={w.brandColor ?? ""} disabled={!ent.limits.whiteLabel} placeholder="#10B981" pattern="#[0-9A-Fa-f]{6}" /></Field>
                </div>
              </div>
              <SubmitButton>Save workspace</SubmitButton>
            </fieldset>
          </ActionForm>
        </CardContent>
      </Card>
      {ctx.role === "owner" && !disabled ? (
        <Card>
          <CardHeader><div><CardTitle>Archive workspace</CardTitle><CardDescription>Monitoring stops for all competitors in this workspace. Data is retained.</CardDescription></div></CardHeader>
          <CardContent><ActionForm action={archiveWorkspaceAction} hidden={{ ws }} confirm={`Archive “${w.name}”? Monitoring stops for all its competitors.`}><SubmitButton variant="danger">Archive workspace</SubmitButton></ActionForm></CardContent>
        </Card>
      ) : null}
    </>
  );
}
