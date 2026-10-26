"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { forgotPasswordAction, loginAction, resetPasswordAction, signupAction, acceptInviteAction } from "@/app/(auth)/actions";
import type { ActionState } from "@/server/actions";

const init: ActionState = {};

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState(loginAction, init);
  return (
    <form action={action} className="space-y-4" noValidate>
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Work email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required autoFocus /></Field>
      <Field label="Password" htmlFor="password" hint={<Link href="/forgot-password" className="text-accent hover:underline">Forgot your password?</Link>}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signupAction, init);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Full name" htmlFor="name" error={fe.name}><Input id="name" name="name" autoComplete="name" required autoFocus aria-invalid={!!fe.name} /></Field>
      <Field label="Work email" htmlFor="email" error={fe.email}><Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe.email} /></Field>
      <Field label="Password" htmlFor="password" error={fe.password} hint="At least 10 characters."><Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required aria-invalid={!!fe.password} /></Field>
      <label className="flex items-start gap-2 text-[13px] text-muted">
        <input type="checkbox" name="terms" className="mt-0.5 size-4 rounded border-border accent-[var(--primary)]" required />
        <span>I agree to the <Link href="/legal/terms" className="text-accent hover:underline">Terms</Link> and <Link href="/legal/privacy" className="text-accent hover:underline">Privacy Policy</Link>.</span>
      </label>
      <SubmitButton className="w-full" pendingText="Creating account…">Create account</SubmitButton>
    </form>
  );
}

export function ForgotForm({ emailConfigured }: { emailConfigured: boolean }) {
  const [state, action] = useActionState(forgotPasswordAction, init);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
      {state.message && !emailConfigured ? <Notice tone="warning">Email delivery is not configured on this server, so no email was sent. The operator can find reset links in the server logs during development.</Notice> : null}
      <Field label="Work email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required autoFocus /></Field>
      <SubmitButton className="w-full" pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, init);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" hint="At least 10 characters."><Input id="password" name="password" type="password" autoComplete="new-password" required autoFocus /></Field>
      <Field label="Confirm password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
      <SubmitButton className="w-full" pendingText="Saving…">Set new password</SubmitButton>
    </form>
  );
}

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInviteAction, init);
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton className="w-full" pendingText="Joining…">Accept invitation</SubmitButton>
    </form>
  );
}
