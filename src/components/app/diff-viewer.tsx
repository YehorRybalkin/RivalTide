import { diffWords } from "diff";
import { Minus, Plus, Replace } from "lucide-react";
import type { ChangeEvidence } from "@/server/detection/diff";
import { cn } from "@/lib/utils";

const KIND: Record<string, string> = { title: "Page title", meta: "Meta description", h1: "Headline", h2: "Heading", h3: "Heading", h4: "Heading", p: "Paragraph", li: "List item", cell: "Table cell", button: "Button", text: "Text" };
const REGION: Record<string, string> = { nav: "navigation", footer: "footer", header: "header", main: "" };

function label(k: string, r: string) {
  const reg = REGION[r];
  return `${KIND[k] ?? k}${reg ? ` · ${reg}` : ""}`;
}

function WordDiff({ before, after, side }: { before: string; after: string; side: "before" | "after" }) {
  const parts = diffWords(before, after);
  return (
    <>
      {parts.map((p, i) => {
        if (p.added) return side === "after" ? <ins key={i} className="rounded-sm bg-primary/25 px-0.5 no-underline">{p.value}</ins> : null;
        if (p.removed) return side === "before" ? <del key={i} className="rounded-sm bg-danger/20 px-0.5">{p.value}</del> : null;
        return <span key={i}>{p.value}</span>;
      })}
    </>
  );
}

export function DiffViewer({ evidence: ev }: { evidence: ChangeEvidence }) {
  const empty = !ev.modified.length && !ev.added.length && !ev.removed.length;
  if (empty) return <p className="text-[13px] text-muted">No textual differences were stored for this change.</p>;
  return (
    <div className="space-y-6 text-[13.5px]">
      {ev.modified.length ? (
        <section aria-labelledby="mod-h">
          <h3 id="mod-h" className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted"><Replace className="size-3.5" /> Modified ({ev.modified.length})</h3>
          <div className="space-y-3">
            {ev.modified.map((m, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-border">
                <div className="border-b border-border bg-surface-2/60 px-3 py-1.5 text-[11.5px] font-medium text-muted">{label(m.k, m.r)}</div>
                <div className="grid md:grid-cols-2">
                  <div className="border-b border-border bg-diff-del p-3 md:border-b-0 md:border-r">
                    <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Before</div>
                    <p className="whitespace-pre-wrap break-words"><WordDiff before={m.before} after={m.after} side="before" /></p>
                  </div>
                  <div className="bg-diff-add p-3">
                    <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">After</div>
                    <p className="whitespace-pre-wrap break-words"><WordDiff before={m.before} after={m.after} side="after" /></p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {ev.added.length ? (
        <section aria-labelledby="add-h">
          <h3 id="add-h" className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted"><Plus className="size-3.5" /> Added ({ev.stats.addedBlocks})</h3>
          <ul className="space-y-1.5">
            {ev.added.map((b, i) => (
              <li key={i} className={cn("rounded-md border border-diff-add-border bg-diff-add px-3 py-2", /^h[1-4]$/.test(b.k) && "font-semibold")}>
                <span className="mr-2 text-[10.5px] font-medium uppercase tracking-wide text-muted">{label(b.k, b.r)}</span>{b.t}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {ev.removed.length ? (
        <section aria-labelledby="rem-h">
          <h3 id="rem-h" className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted"><Minus className="size-3.5" /> Removed ({ev.stats.removedBlocks})</h3>
          <ul className="space-y-1.5">
            {ev.removed.map((b, i) => (
              <li key={i} className="rounded-md border border-diff-del-border bg-diff-del px-3 py-2 text-muted line-through decoration-danger/40">
                <span className="mr-2 text-[10.5px] font-medium uppercase tracking-wide no-underline">{label(b.k, b.r)}</span>{b.t}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
