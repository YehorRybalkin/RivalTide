import Link from "next/link";
import { loadWorkspace } from "@/server/workspace";
import { env } from "@/server/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/app/action-form";
import { deleteAccountAction, deleteOrgAction } from "../actions";

export const metadata = { title: "Privacy & data" };

export default async function PrivacySettings({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { user, ctx } = await loadWorkspace(ws);
  return (
    <>
      <Card>
        <CardHeader><div><CardTitle>Data retention</CardTitle><CardDescription>How long RivalTide keeps monitoring data.</CardDescription></div></CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-[13.5px]">
            <li>Page snapshots that are not evidence for a change or report are deleted after {env().SNAPSHOT_RETENTION_DAYS} days.</li>
            <li>Snapshots used as evidence are retained as long as the change or report exists, so issued reports stay verifiable.</li>
            <li>Monitoring attempt logs are kept for {env().SNAPSHOT_RETENTION_DAYS} days; completed job records for 30 days.</li>
            <li>We store only your name, email, and hashed password as personal data, plus team activity in an audit log.</li>
          </ul>
          <p className="mt-3 text-[13px]"><Link href="/legal/privacy" className="text-accent hover:underline">Privacy Policy</Link></p>
        </CardContent>
      </Card>
      {ctx.role === "owner" && !ctx.isDemo ? (
        <Card className="border-danger/40">
          <CardHeader><div><CardTitle>Delete organization</CardTitle><CardDescription>Permanently deletes {ctx.orgName}, all workspaces, competitors, snapshots, changes, insights and reports. This cannot be undone.</CardDescription></div></CardHeader>
          <CardContent>
            <ActionForm action={deleteOrgAction} hidden={{ ws }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label={`Type “${ctx.orgName}” to confirm`} htmlFor="del-org" className="flex-1"><Input id="del-org" name="confirm" autoComplete="off" /></Field>
              <SubmitButton variant="danger">Delete organization</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
      {!user.isDemo ? (
        <Card className="border-danger/40">
          <CardHeader><div><CardTitle>Delete my account</CardTitle><CardDescription>Deletes your user account. Organizations where you are the only owner are deleted with all their data.</CardDescription></div></CardHeader>
          <CardContent>
            <ActionForm action={deleteAccountAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Type DELETE to confirm" htmlFor="del-acc" className="flex-1"><Input id="del-acc" name="confirm" autoComplete="off" /></Field>
              <SubmitButton variant="danger">Delete account</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
