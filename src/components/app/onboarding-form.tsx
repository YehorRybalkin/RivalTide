"use client";
import { useActionState, useState } from "react";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { createOrgAction } from "@/app/onboarding/actions";
import { cn } from "@/lib/utils";

export function OnboardingOrgForm() {
  const [state, action] = useActionState(createOrgAction, {});
  const [kind, setKind] = useState<"agency" | "company">("agency");
  return (
    <form action={action} className="space-y-5">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">How will you use RivalTide?</legend>
        <div className="grid grid-cols-2 gap-2">
          {([["agency", "Agency or consultant", "Track competitors for clients"], ["company", "My own company", "Founder or in-house team"]] as const).map(([v, t, d]) => (
            <label key={v} className={cn("cursor-pointer rounded-lg border p-3 text-[13px] transition-colors", kind === v ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2")}>
              <input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="sr-only" />
              <span className="block font-medium">{t}</span><span className="text-muted">{d}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Organization name" htmlFor="orgName" error={state.fieldErrors?.orgName}><Input id="orgName" name="orgName" required placeholder={kind === "agency" ? "Brightwave Marketing" : "Acme Inc."} /></Field>
      <Field label={kind === "agency" ? "First client workspace" : "Workspace name"} htmlFor="workspaceName" hint={kind === "agency" ? "You can add more client workspaces later." : "Most companies only need one workspace."}>
        <Input id="workspaceName" name="workspaceName" required defaultValue={kind === "agency" ? "" : "Competitive landscape"} placeholder={kind === "agency" ? "Client: Acme Inc." : ""} key={kind} />
      </Field>
      {kind === "agency" ? <Field label="Client name (optional)" htmlFor="clientName" hint="Shown on client reports."><Input id="clientName" name="clientName" placeholder="Acme Inc." /></Field> : null}
      <SubmitButton className="w-full" pendingText="Creating…">Continue</SubmitButton>
      <p className="text-center text-xs text-muted">Starts your free trial. No payment details required.</p>
    </form>
  );
}
