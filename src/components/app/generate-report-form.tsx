"use client";
import { useActionState, useState } from "react";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { generateReportAction } from "@/app/app/[ws]/actions";

export function GenerateReportForm({ ws, competitors, used, limit }: { ws: string; competitors: { id: string; name: string }[]; used: number; limit: number; hasClient: boolean }) {
  const [state, action] = useActionState(generateReportAction, {});
  const [type, setType] = useState("weekly_brief");
  return (
    <Card className="h-fit p-5">
      <h2 className="text-sm font-semibold">Generate a report</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">{used} of {limit} reports used this month.</p>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="ws" value={ws} />
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        <Field label="Report type" htmlFor="r-type">
          <Select id="r-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="weekly_brief">Weekly competitive brief</option>
            <option value="competitor_deep_dive">Competitor deep dive</option>
            <option value="client_report">Agency client report</option>
          </Select>
        </Field>
        {type === "competitor_deep_dive" ? (
          <Field label="Competitor" htmlFor="r-comp">
            <Select id="r-comp" name="competitorId" required defaultValue="">
              <option value="" disabled>Select a competitor</option>
              {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="Reporting period" htmlFor="r-period">
          <Select id="r-period" name="periodDays" defaultValue={type === "weekly_brief" ? "7" : "30"} key={type}>
            <option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
          </Select>
        </Field>
        <Field label="Title (optional)" htmlFor="r-title"><Input id="r-title" name="title" maxLength={160} /></Field>
        <SubmitButton className="w-full" disabled={used >= limit} pendingText="Generating…">Generate report</SubmitButton>
        <p className="text-[11.5px] text-muted">Reports include only verified changes and insights linked to them, plus a coverage statement and source appendix.</p>
      </form>
    </Card>
  );
}
