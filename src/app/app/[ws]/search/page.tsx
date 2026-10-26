import Link from "next/link";
import { Building2, FileText, Globe, History, Search, Sparkles } from "lucide-react";
import { loadWorkspace } from "@/server/workspace";
import { withUser } from "@/server/db";
import { globalSearch, type SearchResult } from "@/server/services/search";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Search" };

const GROUPS: { type: SearchResult["type"]; label: string; icon: typeof Building2 }[] = [
  { type: "competitor", label: "Competitors", icon: Building2 },
  { type: "page", label: "Monitored pages", icon: Globe },
  { type: "change", label: "Changes", icon: History },
  { type: "insight", label: "Insights", icon: Sparkles },
  { type: "report", label: "Reports", icon: FileText },
];

export default async function SearchPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ q?: string }> }) {
  const { ws } = await params;
  const { q = "" } = await searchParams;
  const { user } = await loadWorkspace(ws);
  const results = q.trim().length >= 2 ? await withUser(user.id, (tx) => globalSearch(tx, q)) : [];
  return (
    <div className="max-w-3xl">
      <PageHeader title="Search" description="Across all workspaces you have access to." />
      <form className="mb-6 flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search</label>
        <Input id="q" name="q" defaultValue={q} placeholder="Competitor, URL, change, insight or report…" autoFocus />
        <Button type="submit"><Search /> Search</Button>
      </form>
      {q.trim().length < 2 ? <p className="text-[13px] text-muted">Type at least two characters.</p> : results.length === 0 ? (
        <EmptyState icon={Search} title={`No results for “${q}”`} description="Try a competitor name, a domain, or words from a change summary." />
      ) : (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const items = results.filter((r) => r.type === g.type);
            if (!items.length) return null;
            return (
              <section key={g.type}>
                <h2 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted"><g.icon className="size-3.5" />{g.label}</h2>
                <Card className="divide-y divide-border">
                  {items.map((r) => (
                    <Link key={`${r.type}-${r.id}`} href={r.href} className="block px-4 py-3 hover:bg-surface-2/60">
                      <p className="truncate text-[13.5px] font-medium">{r.title}</p>
                      <p className="truncate text-[12px] text-muted">{r.subtitle}</p>
                    </Link>
                  ))}
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
