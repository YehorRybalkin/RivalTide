import Link from "next/link";
import { notFound } from "next/navigation";
import { inWorkspace, loadWorkspace } from "@/server/workspace";
import { getSnapshot } from "@/server/services/changes";
import { AppError } from "@/server/services/errors";
import { Card, CardContent } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Snapshot" };

export default async function SnapshotPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  await loadWorkspace(ws);
  const s = await inWorkspace(ws, (tx, ctx) => getSnapshot(tx, ctx, id)).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow={<Link href={`/app/${ws}/changes`} className="hover:text-foreground">Change history</Link>} title={`Snapshot of ${s.url}`} description={`${s.competitorName} · fetched ${formatDate(s.createdAt, true)} · HTTP ${s.httpStatus ?? "—"}`} />
      <Notice tone="info" className="mb-4">This is the normalized text RivalTide extracted and stored at fetch time (scripts, cookie banners and hidden elements removed). Content hash <span className="font-mono">{s.contentHash.slice(0, 24)}…</span></Notice>
      <Card>
        <CardContent className="space-y-1.5 text-[13.5px]">
          {s.content.blocks.map((b, i) => (
            <p key={i} className={b.k.startsWith("h") ? "pt-2 font-semibold" : b.r === "nav" || b.r === "footer" ? "text-muted" : ""}>
              <span className="mr-2 inline-block w-14 text-[10.5px] uppercase tracking-wide text-subtle">{b.k}{b.r !== "main" ? `·${b.r}` : ""}</span>{b.t}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
