import { loadWorkspace, inWorkspace } from "@/server/workspace";
import { getNotificationPrefs } from "@/server/services/organization";
import { getEntitlements } from "@/server/billing/entitlements";
import { isEmailConfigured } from "@/server/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/app/action-form";
import { notificationPrefsAction } from "../actions";

export const metadata = { title: "Notification settings" };

export default async function NotificationSettings({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { ctx } = await loadWorkspace(ws);
  const { prefs, ent } = await inWorkspace(ws, async (tx, c) => ({ prefs: await getNotificationPrefs(tx, c), ent: await getEntitlements(tx, c.orgId) }));
  return (
    <Card>
      <CardHeader><div><CardTitle>Alerts for “{ctx.workspaceName}”</CardTitle><CardDescription>Preferences apply to you only, per workspace. Alerts are created only for verified changes of medium or high severity, and never twice for the same change.</CardDescription></div></CardHeader>
      <CardContent className="space-y-4">
        {!isEmailConfigured() ? <Notice tone="info">Email delivery is not configured on this server. Email preferences are saved but no emails will be sent until an email provider is configured.</Notice> : null}
        {!ent.limits.emailAlerts ? <Notice tone="warning">Email alerts are included from the Growth plan. In-app notifications work on every plan.</Notice> : null}
        <ActionForm action={notificationPrefsAction} hidden={{ ws }} className="space-y-4">
          <Field label="Notify me about" htmlFor="mode">
            <Select id="mode" name="mode" defaultValue={prefs.mode}>
              <option value="all">All validated material changes</option>
              <option value="high_priority">High-priority changes only</option>
              <option value="pricing_only">Pricing changes only</option>
              <option value="digest_only">Weekly digest only (no immediate emails)</option>
              <option value="none">Nothing</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="emailEnabled" defaultChecked={prefs.emailEnabled} className="size-4 accent-[var(--primary)]" /> Send emails (immediate alerts and digests)</label>
          <Field label="Digest" htmlFor="digest">
            <Select id="digest" name="digest" defaultValue={prefs.digest}>
              <option value="none">No digest</option><option value="daily">Daily digest</option><option value="weekly">Weekly digest</option>
            </Select>
          </Field>
          <SubmitButton>Save preferences</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
