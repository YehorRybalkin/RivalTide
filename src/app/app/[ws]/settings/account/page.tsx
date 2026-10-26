import { loadWorkspace } from "@/server/workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ActionForm } from "@/components/app/action-form";
import { changePasswordAction, updateProfileAction } from "../actions";

export const metadata = { title: "Account settings" };

export default async function AccountSettings({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { user } = await loadWorkspace(ws);
  return (
    <>
      <Card>
        <CardHeader><div><CardTitle>Profile</CardTitle><CardDescription>{user.isDemo ? "Demo visitor" : user.email}</CardDescription></div></CardHeader>
        <CardContent>
          <ActionForm action={updateProfileAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Name" htmlFor="name" className="flex-1"><Input id="name" name="name" defaultValue={user.name} required /></Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      {!user.isDemo ? (
        <Card>
          <CardHeader><div><CardTitle>Password</CardTitle><CardDescription>Forgot it? Sign out and use “Forgot your password?”.</CardDescription></div></CardHeader>
          <CardContent>
            <ActionForm action={changePasswordAction} className="grid gap-3 sm:grid-cols-3" resetOnSuccess>
              <Field label="Current password" htmlFor="current"><Input id="current" name="current" type="password" autoComplete="current-password" required /></Field>
              <Field label="New password" htmlFor="next"><Input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required /></Field>
              <Field label="Confirm" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
              <div className="sm:col-span-3"><SubmitButton variant="secondary">Change password</SubmitButton></div>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><div><CardTitle>Appearance</CardTitle><CardDescription>Light, dark, or follow your system setting.</CardDescription></div><ThemeToggle /></CardHeader>
        <CardContent />
      </Card>
    </>
  );
}
