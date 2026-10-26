"use client";
import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Notice } from "@/components/ui/misc";
import { ActionForm } from "./action-form";
import { inviteAction } from "@/app/app/[ws]/settings/actions";

export function InviteForm({ ws }: { ws: string }) {
  const [link, setLink] = useState<string | null>(null);
  return (
    <>
      <ActionForm action={inviteAction} hidden={{ ws }} className="flex flex-col gap-3 sm:flex-row sm:items-end" resetOnSuccess onSuccess={(s) => setLink((s.data as { link?: string } | undefined)?.link ?? null)}>
        <Field label="Email" htmlFor="inv-email" className="flex-1"><Input id="inv-email" name="email" type="email" required /></Field>
        <Field label="Role" htmlFor="inv-role"><Select id="inv-role" name="role" defaultValue="member"><option value="member">Member</option><option value="owner">Owner</option></Select></Field>
        <SubmitButton>Send invite</SubmitButton>
      </ActionForm>
      {link ? <Notice tone="warning" className="mt-3">Email is not configured, so no email was sent. Share this link: <span className="break-all font-mono text-[12px]">{link}</span></Notice> : null}
    </>
  );
}
