"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ActionForm } from "./action-form";
import { addCriterionAction, deleteCriterionAction, setCriterionValueAction } from "@/app/app/[ws]/actions";

export function CriteriaManager({ ws, criteria }: { ws: string; criteria: { id: string; name: string }[] }) {
  return (
    <Card className="p-5">
      <p className="text-[13px] font-medium">Custom criteria</p>
      <p className="mt-0.5 text-[12.5px] text-muted">Add your own rows (e.g. “SSO”, “API access”) and record values with their source.</p>
      <ActionForm action={addCriterionAction} hidden={{ ws }} className="mt-3 flex gap-2" resetOnSuccess>
        <label htmlFor="crit-name" className="sr-only">Criterion name</label>
        <Input id="crit-name" name="name" placeholder="e.g. Single sign-on" required maxLength={80} />
        <SubmitButton variant="secondary"><Plus /> Add</SubmitButton>
      </ActionForm>
      {criteria.length ? (
        <ul className="mt-3 divide-y divide-border text-[13px]">
          {criteria.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              {c.name}
              <form action={deleteCriterionAction}><input type="hidden" name="ws" value={ws} /><input type="hidden" name="criterionId" value={c.id} />
                <button type="submit" className="rounded-md p-1 text-muted hover:bg-danger-soft hover:text-danger" aria-label={`Delete criterion ${c.name}`}><Trash2 className="size-4" /></button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

export function CellEditor({ ws, criterionId, competitorId, competitorName, criterion, value, source, evidenceUrl }: { ws: string; criterionId: string; competitorId: string; competitorName: string; criterion: string; value: string | null; source?: string; evidenceUrl: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><button className="rounded p-0.5 text-muted hover:text-foreground" aria-label={`Edit ${criterion} for ${competitorName}`}><Pencil className="size-3.5" /></button></DialogTrigger>
      <DialogContent title={`${criterion} — ${competitorName}`} description="Leave the value empty to clear it (it will show as “Not available”).">
        <ActionForm action={setCriterionValueAction} hidden={{ ws, criterionId, competitorId }} className="space-y-3" onSuccess={() => setOpen(false)}>
          <Field label="Value" htmlFor="cv-value"><Input id="cv-value" name="value" defaultValue={value ?? ""} maxLength={300} /></Field>
          <Field label="Source" htmlFor="cv-source">
            <Select id="cv-source" name="source" defaultValue={source && source !== "observed" && source !== "derived" ? source : "competitor_claim"}>
              <option value="competitor_claim">Competitor claim (from their materials)</option>
              <option value="validated">Validated by our team</option>
              <option value="user_note">Team note</option>
            </Select>
          </Field>
          <Field label="Evidence URL (optional)" htmlFor="cv-url"><Input id="cv-url" name="evidenceUrl" type="url" defaultValue={evidenceUrl ?? ""} placeholder="https://" /></Field>
          <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
