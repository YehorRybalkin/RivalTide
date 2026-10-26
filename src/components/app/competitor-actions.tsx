"use client";
import { useState } from "react";
import { Archive, MoreHorizontal, Pause, Pencil, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "./action-form";
import { addPageAction, checkNowAction, competitorStatusAction, pageStatusAction, updateCompetitorAction } from "@/app/app/[ws]/actions";
import { PAGE_TYPE_LABEL } from "@/lib/utils";

interface Comp { id: string; name: string; websiteUrl: string; description: string | null; category: string | null; industry: string | null; notes: string | null; status: string }

export function CompetitorActions({ ws, competitor: c }: { ws: string; competitor: Comp }) {
  const [open, setOpen] = useState(false);
  const hidden = { ws, competitorId: c.id };
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="secondary" size="sm"><Pencil /> Edit</Button></DialogTrigger>
        <DialogContent title="Edit competitor">
          <ActionForm action={updateCompetitorAction} hidden={hidden} className="space-y-3" onSuccess={() => setOpen(false)}>
            <Field label="Name" htmlFor="e-name"><Input id="e-name" name="name" defaultValue={c.name} required /></Field>
            <Field label="Website" htmlFor="e-url"><Input id="e-url" name="websiteUrl" defaultValue={c.websiteUrl} required /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" htmlFor="e-cat"><Input id="e-cat" name="category" defaultValue={c.category ?? ""} /></Field>
              <Field label="Industry" htmlFor="e-ind"><Input id="e-ind" name="industry" defaultValue={c.industry ?? ""} /></Field>
            </div>
            <Field label="Description" htmlFor="e-desc"><Textarea id="e-desc" name="description" defaultValue={c.description ?? ""} rows={2} /></Field>
            <Field label="Notes" htmlFor="e-notes"><Textarea id="e-notes" name="notes" defaultValue={c.notes ?? ""} rows={3} /></Field>
            <div className="flex justify-end"><SubmitButton pendingText="Saving…">Save changes</SubmitButton></div>
          </ActionForm>
        </DialogContent>
      </Dialog>
      {c.status === "active" ? (
        <ActionForm action={competitorStatusAction} hidden={{ ...hidden, status: "paused" }}><SubmitButton variant="secondary" size="sm"><Pause /> Pause monitoring</SubmitButton></ActionForm>
      ) : (
        <ActionForm action={competitorStatusAction} hidden={{ ...hidden, status: "active" }}><SubmitButton variant="secondary" size="sm"><Play /> {c.status === "archived" ? "Restore" : "Resume monitoring"}</SubmitButton></ActionForm>
      )}
      {c.status !== "archived" ? (
        <ActionForm action={competitorStatusAction} hidden={{ ...hidden, status: "archived" }} confirm={`Archive ${c.name}? Monitoring stops; history and evidence are kept.`}>
          <SubmitButton variant="ghost" size="sm"><Archive /> Archive</SubmitButton>
        </ActionForm>
      ) : null}
    </div>
  );
}

export function PageActions({ ws, page }: { ws: string; page: { id: string; status: string } }) {
  const [menu, setMenu] = useState(false);
  const hidden = { ws, pageId: page.id };
  return (
    <div className="flex items-center justify-end gap-1">
      {page.status === "active" ? (
        <ActionForm action={checkNowAction} hidden={hidden}>
          <SubmitButton variant="ghost" size="sm" title="Run a permitted check now" pendingText="Checking…"><RefreshCw /> <span className="hidden xl:inline">Check now</span></SubmitButton>
        </ActionForm>
      ) : null}
      <div className="relative">
        <Button variant="ghost" size="icon" aria-label="More page actions" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><MoreHorizontal /></Button>
        {menu ? (
          <div className="absolute right-0 top-10 z-20 w-44 rounded-lg border border-border bg-surface p-1 text-left shadow-pop" onMouseLeave={() => setMenu(false)}>
            <ActionForm action={pageStatusAction} hidden={{ ...hidden, status: page.status === "active" ? "paused" : "active" }}>
              <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-2">{page.status === "active" ? <><Pause className="size-4 text-muted" /> Pause page</> : <><Play className="size-4 text-muted" /> Resume page</>}</button>
            </ActionForm>
            <ActionForm action={pageStatusAction} hidden={{ ...hidden, status: "removed" }} confirm="Stop monitoring this page? Existing changes and evidence are kept.">
              <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-danger hover:bg-danger-soft"><Trash2 className="size-4" /> Remove page</button>
            </ActionForm>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AddPageForm({ ws, competitorId, websiteUrl, browserAllowed }: { ws: string; competitorId: string; websiteUrl: string; browserAllowed: boolean }) {
  return (
    <ActionForm action={addPageAction} hidden={{ ws, competitorId }} className="flex flex-col gap-2 lg:flex-row lg:items-end" resetOnSuccess>
      <Field label="Add a page" htmlFor="add-url" className="flex-1"><Input id="add-url" name="url" placeholder={`${websiteUrl.replace(/\/$/, "")}/pricing`} required /></Field>
      <Field label="Type" htmlFor="add-type" className="lg:w-40">
        <Select id="add-type" name="pageType" defaultValue="">
          <option value="">Detect from URL</option>
          {Object.entries(PAGE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Fetching" htmlFor="add-render" className="lg:w-44">
        <Select id="add-render" name="renderMode" defaultValue="static">
          <option value="static">Standard (HTML)</option>
          <option value="browser" disabled={!browserAllowed}>JavaScript rendering{browserAllowed ? "" : " (Growth+)"}</option>
        </Select>
      </Field>
      <SubmitButton variant="secondary" pendingText="Adding…"><Plus /> Add page</SubmitButton>
    </ActionForm>
  );
}
