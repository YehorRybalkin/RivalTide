"use client";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, Check, Globe, Lock, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { createCompetitorAction, discoverAction } from "@/app/app/[ws]/actions";
import type { DiscoveryResult, PageSuggestion } from "@/server/services/discovery";
import { PAGE_TYPE_LABEL, cn } from "@/lib/utils";

const TYPES = ["homepage", "pricing", "features", "product", "blog", "changelog", "announcements", "other"] as const;

export function AddCompetitorWizard({ ws, onboarding, remainingPages, remainingCompetitors, active }: { ws: string; onboarding: boolean; remainingPages: number; remainingCompetitors: number; active: boolean }) {
  const [step, setStep] = useState<"details" | "pages">("details");
  const [details, setDetails] = useState({ name: "", websiteUrl: "", description: "", category: "Direct competitor", industry: "", notes: "" });
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [discoverState, discover] = useActionState(discoverAction, {});
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Record<string, { pageType: (typeof TYPES)[number]; label: string }>>({});
  const [custom, setCustom] = useState("");
  const [customType, setCustomType] = useState<(typeof TYPES)[number]>("other");
  const [extra, setExtra] = useState<PageSuggestion[]>([]);
  const [createState, create] = useActionState(createCompetitorAction, {});

  useEffect(() => {
    if (discoverState.data) {
      const d = discoverState.data as DiscoveryResult;
      setDiscovery(d);
      const pre: typeof selected = {};
      for (const s of d.suggestions) {
        if (s.allowedByRobots && s.source !== "guess" && Object.keys(pre).length < Math.min(4, remainingPages)) pre[s.url] = { pageType: s.pageType, label: s.label };
      }
      setSelected(pre);
      if (!details.name && d.title) setDetails((v) => ({ ...v, name: d.title!.split(/[|—–-]/)[0]!.trim().slice(0, 60) }));
      if (!details.description && d.description) setDetails((v) => ({ ...v, description: d.description!.slice(0, 300) }));
      setDetails((v) => ({ ...v, websiteUrl: d.url }));
      setStep("pages");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoverState]);

  const suggestions = useMemo(() => [...(discovery?.suggestions ?? []), ...extra], [discovery, extra]);
  const count = Object.keys(selected).length;
  const overLimit = count > remainingPages;

  if (!active) return <Notice tone="warning" title="Your plan is not active">Choose a plan in Settings → Billing to add competitors.</Notice>;
  if (remainingCompetitors <= 0) return <Notice tone="warning" title="Competitor limit reached">Archive a competitor or upgrade your plan to add more.</Notice>;

  if (step === "details") {
    return (
      <Card>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData();
              fd.set("ws", ws);
              fd.set("url", details.websiteUrl);
              startTransition(() => discover(fd));
            }}
          >
            {discoverState.error ? <Notice tone="danger">{discoverState.error}</Notice> : null}
            <Field label="Website URL" htmlFor="websiteUrl" hint="The competitor's public website, e.g. northstar.com">
              <Input id="websiteUrl" value={details.websiteUrl} onChange={(e) => setDetails({ ...details, websiteUrl: e.target.value })} placeholder="competitor.com" required autoFocus inputMode="url" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Competitor name" htmlFor="name" hint="We can fill this from their website."><Input id="name" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} placeholder="Northstar Analytics" /></Field>
              <Field label="Category" htmlFor="category">
                <Select id="category" value={details.category} onChange={(e) => setDetails({ ...details, category: e.target.value })}>
                  {["Direct competitor", "Indirect competitor", "Aspirational", "Emerging", "Partner / adjacent"].map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Industry (optional)" htmlFor="industry"><Input id="industry" value={details.industry} onChange={(e) => setDetails({ ...details, industry: e.target.value })} placeholder="Marketing analytics" /></Field>
            <Field label="Description (optional)" htmlFor="description"><Textarea id="description" value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} rows={2} /></Field>
            <Field label="Notes (optional)" htmlFor="notes" hint="Private to your team."><Textarea id="notes" value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} rows={2} /></Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending || !details.websiteUrl.trim()}>{pending ? "Checking website…" : <><Search /> Check website & suggest pages</>}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {onboarding ? null : null}
      <Card>
        <CardContent className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2"><Globe className="size-5 text-muted" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{details.name || discovery?.title || details.websiteUrl}</p>
            <p className="truncate text-[13px] text-muted">{discovery?.url}</p>
            {discovery?.description ? <p className="mt-1 text-[13px] text-muted">{discovery.description}</p> : null}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setStep("details")}><ArrowLeft /> Edit</Button>
        </CardContent>
      </Card>
      {discovery?.problem ? <Notice tone="warning" title="Limited access">{discovery.problem}</Notice> : null}

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Choose pages to monitor</h2>
          <p className="mt-0.5 text-[13px] text-muted">Select the pages that matter. RivalTide does not crawl the whole site. {remainingPages} page slot{remainingPages === 1 ? "" : "s"} left on your plan.</p>
        </div>
        <ul className="divide-y divide-border">
          {suggestions.map((s) => {
            const checked = Boolean(selected[s.url]);
            const blocked = s.allowedByRobots === false;
            return (
              <li key={s.url} className={cn("flex items-center gap-3 px-5 py-3", blocked && "opacity-60")}>
                <input id={`p-${s.url}`} type="checkbox" className="size-4 rounded accent-[var(--primary)]" disabled={blocked} checked={checked}
                  onChange={(e) => setSelected((prev) => {
                    const next = { ...prev };
                    if (e.target.checked) next[s.url] = { pageType: s.pageType, label: s.label };
                    else delete next[s.url];
                    return next;
                  })} />
                <label htmlFor={`p-${s.url}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block truncate text-[13.5px] font-medium">{s.label}</span>
                  <span className="block truncate text-[12px] text-muted">{s.url}</span>
                </label>
                {blocked ? <Badge tone="violet"><Lock className="size-3" />Blocked by robots.txt</Badge> : s.source === "guess" ? <Badge tone="amber"><AlertTriangle className="size-3" />Unverified</Badge> : null}
                <Select aria-label={`Page type for ${s.url}`} className="h-8 w-36 text-[12.5px]" disabled={!checked} value={selected[s.url]?.pageType ?? s.pageType}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [s.url]: { pageType: e.target.value as (typeof TYPES)[number], label: prev[s.url]?.label ?? s.label } }))}>
                  {TYPES.map((t) => <option key={t} value={t}>{PAGE_TYPE_LABEL[t]}</option>)}
                </Select>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row">
          <label htmlFor="custom-url" className="sr-only">Add another page URL</label>
          <Input id="custom-url" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={`${discovery?.url ?? "https://…"}changelog`} className="flex-1" />
          <Select aria-label="Page type" value={customType} onChange={(e) => setCustomType(e.target.value as (typeof TYPES)[number])} className="sm:w-40">
            {TYPES.map((t) => <option key={t} value={t}>{PAGE_TYPE_LABEL[t]}</option>)}
          </Select>
          <Button type="button" variant="secondary" disabled={!custom.trim()} onClick={() => {
            let u = custom.trim();
            if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
            setExtra((x) => [...x, { url: u, pageType: customType, label: PAGE_TYPE_LABEL[customType] ?? "Page", allowedByRobots: null, source: "link" }]);
            setSelected((prev) => ({ ...prev, [u]: { pageType: customType, label: PAGE_TYPE_LABEL[customType] ?? "Page" } }));
            setCustom("");
          }}><Plus /> Add page</Button>
        </div>
      </Card>

      <form action={create} className="space-y-3">
        <input type="hidden" name="ws" value={ws} />
        {onboarding ? <input type="hidden" name="onboarding" value="1" /> : null}
        {Object.entries(details).map(([k, v]) => <input key={k} type="hidden" name={k} value={v || (k === "name" ? discovery?.title ?? "" : "")} />)}
        <input type="hidden" name="pages" value={JSON.stringify(Object.entries(selected).map(([url, v]) => ({ url, pageType: v.pageType, label: v.label.replace(/ \(.*\)$/, "") })))} />
        {createState.error ? <Notice tone="danger">{createState.error}</Notice> : null}
        {overLimit ? <Notice tone="warning">You selected {count} pages but have {remainingPages} slot{remainingPages === 1 ? "" : "s"} left.</Notice> : null}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3">
          <p className="text-[13px] text-muted"><Check className="mr-1 inline size-4 text-primary" />{count} page{count === 1 ? "" : "s"} selected. We&apos;ll take a baseline snapshot of each now; changes appear after the next scheduled check.</p>
          <SubmitButton disabled={count === 0 || overLimit || !(details.name || discovery?.title)} pendingText="Taking baseline snapshots…">Start monitoring</SubmitButton>
        </div>
        {!(details.name || discovery?.title) ? <p className="text-xs text-danger">Add a competitor name to continue.</p> : null}
      </form>
    </div>
  );
}
