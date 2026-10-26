import Link from "next/link";
import { History } from "lucide-react";
import { inWorkspace, loadWorkspace } from "@/server/workspace";
import { changeFilters, listChanges, PAGE_SIZE, CATEGORIES } from "@/server/services/changes";
import { listCompetitors } from "@/server/services/competitors";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChangeRow } from "@/components/app/change-row";
import { markAllReadAction } from "../actions";
import { CATEGORY_META } from "@/lib/utils";

export const metadata = { title: "Change history" };

export default async function ChangesPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string>> }) {
  const { ws } = await params;
  const sp = await searchParams;
  await loadWorkspace(ws);
  const f = changeFilters.parse(sp);
  const { result, competitors } = await inWorkspace(ws, async (tx, ctx) => ({
    result: await listChanges(tx, ctx, f),
    competitors: await listCompetitors(tx, ctx, { includeArchived: true }),
  }));
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v !== undefined && v !== "") p.set(k, String(v));
    return `?${p.toString()}`;
  };
  const filtered = Object.keys(sp).some((k) => k !== "page" && sp[k]);
  return (
    <>
      <PageHeader title="Change history" description="Every verified change, with before/after evidence. Monitoring failures never appear here."
        actions={<form action={markAllReadAction}><input type="hidden" name="ws" value={ws} /><Button variant="secondary" size="sm" type="submit">Mark all as read</Button></form>} />
      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" method="get" aria-label="Filter changes">
          <Select name="competitor" defaultValue={f.competitor ?? ""} aria-label="Competitor" className="xl:col-span-2">
            <option value="">All competitors</option>
            {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select name="category" defaultValue={f.category ?? ""} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_META[c]?.label}</option>)}
          </Select>
          <Select name="severity" defaultValue={f.severity ?? ""} aria-label="Severity">
            <option value="">Any severity</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </Select>
          <Select name="read" defaultValue={f.read ?? ""} aria-label="Read status">
            <option value="">Read & unread</option><option value="unread">Unread</option><option value="read">Read</option>
          </Select>
          <Select name="review" defaultValue={f.review ?? ""} aria-label="Review status">
            <option value="">Not dismissed</option><option value="unreviewed">Unreviewed</option><option value="reviewed">Reviewed</option><option value="needs_review">Needs review</option><option value="dismissed">Dismissed</option>
          </Select>
          <Input type="date" name="from" defaultValue={f.from ?? ""} aria-label="From date" />
          <Input type="date" name="to" defaultValue={f.to ?? ""} aria-label="To date" />
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4 xl:col-span-8">
            <Button type="submit" size="sm">Apply filters</Button>
            {filtered ? <Button asChild variant="ghost" size="sm"><Link href="?">Clear</Link></Button> : null}
            <span className="ml-auto self-center text-[13px] text-muted">{result.total} change{result.total === 1 ? "" : "s"}</span>
          </div>
        </form>
      </Card>
      {result.items.length === 0 ? (
        <EmptyState icon={History} title={filtered ? "No changes match these filters" : "No changes yet"} description={filtered ? "Try widening the date range or clearing filters." : "Changes appear after a monitored page has two successful snapshots that differ meaningfully."} />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">{result.items.map((c) => <ChangeRow key={c.id} c={c} wsId={ws} />)}</ul>
        </Card>
      )}
      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-[13px]" aria-label="Pagination">
          <span className="text-muted">Page {f.page} of {pages}</span>
          <div className="flex gap-2">
            {f.page > 1 ? <Button asChild variant="secondary" size="sm"><Link href={qs({ page: f.page - 1 })}>Previous</Link></Button> : null}
            {f.page < pages ? <Button asChild variant="secondary" size="sm"><Link href={qs({ page: f.page + 1 })}>Next</Link></Button> : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
